const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PENDING_ROOT = path.join(ROOT, 'tools', 'admin', 'uploads', 'settings', 'pending');
const SETTINGS_JSON = path.join(ROOT, 'src', 'data', 'site-settings.json');
const ADMIN_SETTINGS_JSON = path.join(ROOT, 'tools', 'admin', 'public', 'data', 'site-settings.json');
const SITE_IMAGE_DIR = path.join(ROOT, 'public', 'images', 'site');

const isDryRun = process.argv.includes('--dry-run');

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

async function main() {
  const pendingItems = readPendingItems();
  if (!pendingItems.length) {
    console.log('No pending settings images found.');
    setGithubOutput({ changed: 'false', commit_message: 'Process pending settings image' });
    return;
  }
  if (pendingItems.length > 1) {
    throw new Error('Multiple pending settings images found. Process one settings image at a time.');
  }

  const settings = readJson(SETTINGS_JSON, 'src/data/site-settings.json');
  const item = pendingItems[0];
  const nextSettings = buildNextSettings(settings, item);
  const outputPath = outputImagePath(item, nextSettings);
  if (fs.existsSync(outputPath.absolute)) throw new Error(`Settings image already exists: ${rel(outputPath.absolute)}`);

  console.log(`Pending settings image: ${item.settings.kind}`);
  if (isDryRun) {
    console.log(`Would write: ${outputPath.publicPath}`);
    console.log('Dry-run completed. No files were changed.');
    return;
  }

  fs.mkdirSync(path.dirname(outputPath.absolute), { recursive: true });
  await writeWebp(item.originalPath, outputPath.absolute);

  const historyKey = item.settings.kind === 'hero' ? 'heroImageHistory' : 'aboutImageHistory';
  const currentKey = item.settings.kind === 'hero' ? 'heroImage' : 'aboutImage';
  const seasonKey = `${currentKey}Season`;
  const yearKey = `${currentKey}Year`;
  const memoKey = `${currentKey}Memo`;
  const historyItem = {
    path: outputPath.publicPath,
    year: item.settings.year,
    season: item.settings.season,
    memo: item.settings.memo,
    savedAt: new Date().toISOString()
  };

  const finalSettings = {
    ...nextSettings,
    [currentKey]: outputPath.publicPath,
    [seasonKey]: item.settings.season,
    [yearKey]: item.settings.year,
    [memoKey]: item.settings.memo,
    [historyKey]: [...(Array.isArray(nextSettings[historyKey]) ? nextSettings[historyKey] : []), historyItem]
  };
  writeJson(SETTINGS_JSON, finalSettings);
  writeJson(ADMIN_SETTINGS_JSON, finalSettings);
  fs.rmSync(item.dir, { recursive: true, force: true });

  setGithubOutput({
    changed: 'true',
    commit_message: `Process pending ${item.settings.kind} image`
  });
  console.log(`Processed pending settings image: ${outputPath.publicPath}`);
}

function readPendingItems() {
  if (!fs.existsSync(PENDING_ROOT)) return [];
  return fs.readdirSync(PENDING_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(PENDING_ROOT, entry.name);
      const settingsJsonPath = path.join(dir, 'settings.json');
      if (!fs.existsSync(settingsJsonPath)) throw new Error(`Missing settings.json: ${rel(settingsJsonPath)}`);
      return {
        dir,
        originalPath: findOriginalImage(dir),
        settings: normalizeSettings(readJson(settingsJsonPath, rel(settingsJsonPath)), entry.name)
      };
    })
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

function findOriginalImage(dir) {
  const candidates = ['original.jpg', 'original.png']
    .map((name) => path.join(dir, name))
    .filter((filePath) => fs.existsSync(filePath));
  if (!candidates.length) throw new Error(`Missing original.jpg/original.png: ${rel(dir)}`);
  if (candidates.length > 1) throw new Error(`Multiple original images found: ${candidates.map(rel).join(', ')}`);
  return candidates[0];
}

function normalizeSettings(settings, dirName) {
  const kind = trim(settings.kind);
  if (kind !== 'hero' && kind !== 'about') throw new Error(`${dirName}/settings.json: kind must be hero or about.`);
  const year = Number(settings.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error(`${dirName}/settings.json: invalid year.`);
  return {
    kind,
    year,
    season: trim(settings.season) || 'spring',
    memo: trim(settings.memo)
  };
}

function buildNextSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('src/data/site-settings.json must be an object.');
  }
  return { ...settings };
}

function outputImagePath(item, settings) {
  const dir = item.settings.kind === 'hero'
    ? path.join(SITE_IMAGE_DIR, 'hero')
    : path.join(SITE_IMAGE_DIR, 'about');
  const historyKey = item.settings.kind === 'hero' ? 'heroImageHistory' : 'aboutImageHistory';
  const sequence = nextSequence(settings[historyKey], item.settings);
  const fileName = `${item.settings.year}_${item.settings.season}_${String(sequence).padStart(3, '0')}.webp`;
  const absolute = path.join(dir, fileName);
  return {
    absolute,
    publicPath: `/images/site/${item.settings.kind === 'hero' ? 'hero/' : 'about/'}${fileName}`
  };
}

function nextSequence(history, settings) {
  const prefix = `${settings.year}_${settings.season}_`;
  const values = (Array.isArray(history) ? history : [])
    .map((item) => path.basename(String(item?.path || '')))
    .filter((name) => name.startsWith(prefix) && name.endsWith('.webp'))
    .map((name) => Number(name.slice(prefix.length, prefix.length + 3)))
    .filter((value) => Number.isInteger(value));
  return values.length ? Math.max(...values) + 1 : 1;
}

async function writeWebp(input, output) {
  const sharp = require('sharp');
  await sharp(input, { failOn: 'none', unlimited: true })
    .rotate()
    .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(output);
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`${label} could not be read: ${err.message}`);
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function trim(value) {
  return String(value || '').trim();
}

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function setGithubOutput(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
}
