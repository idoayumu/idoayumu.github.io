const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PENDING_ROOT = path.join(ROOT, 'tools', 'admin', 'uploads', 'works', 'pending');
const WORKS_JSON = path.join(ROOT, 'src', 'data', 'works.json');
const ADMIN_WORKS_JSON = path.join(ROOT, 'tools', 'admin', 'public', 'data', 'works.json');
const LARGE_DIR = path.join(ROOT, 'public', 'images', 'works', 'large');
const THUMB_DIR = path.join(ROOT, 'public', 'images', 'works', 'thumbs');
const WORK_ID_PATTERN = /^\d{6}[A-Za-z0-9][A-Za-z0-9_-]*_\d{4}$/;

const isDryRun = process.argv.includes('--dry-run');

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

async function main() {
  const pendingItems = readPendingItems();
  if (!pendingItems.length) {
    console.log('No pending works found.');
    setGithubOutput({
      changed: 'false',
      commit_message: 'Process pending works'
    });
    return;
  }

  const works = readJson(WORKS_JSON, 'src/data/works.json');
  validatePendingItems(pendingItems, works);

  console.log(`Pending works: ${pendingItems.map((item) => item.work.id).join(', ')}`);

  if (isDryRun) {
    console.log('Dry-run completed. No files were changed.');
    return;
  }

  fs.mkdirSync(LARGE_DIR, { recursive: true });
  fs.mkdirSync(THUMB_DIR, { recursive: true });

  for (const item of pendingItems) {
    await writeWebpImages(item);
  }

  const nextWorks = [
    ...works,
    ...pendingItems.map((item) => item.work)
  ];
  writeJson(WORKS_JSON, nextWorks);
  writeJson(ADMIN_WORKS_JSON, nextWorks);

  for (const item of pendingItems) {
    fs.rmSync(item.dir, { recursive: true, force: true });
  }

  setGithubOutput({
    changed: 'true',
    commit_message: pendingItems.length === 1
      ? `Process pending work ${pendingItems[0].work.id}`
      : `Process ${pendingItems.length} pending works`
  });

  console.log(`Processed ${pendingItems.length} pending work(s).`);
}

function readPendingItems() {
  if (!fs.existsSync(PENDING_ROOT)) return [];

  return fs.readdirSync(PENDING_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(PENDING_ROOT, entry.name);
      const workJsonPath = path.join(dir, 'work.json');
      if (!fs.existsSync(workJsonPath)) {
        throw new Error(`Missing work.json: ${rel(workJsonPath)}`);
      }

      const originalPath = findOriginalImage(dir);
      const work = readJson(workJsonPath, rel(workJsonPath));
      return {
        dir,
        workJsonPath,
        originalPath,
        work: normalizeWork(work, entry.name)
      };
    })
    .sort((a, b) => a.work.id.localeCompare(b.work.id));
}

function findOriginalImage(dir) {
  const candidates = ['original.jpg', 'original.png']
    .map((name) => path.join(dir, name))
    .filter((filePath) => fs.existsSync(filePath));

  if (!candidates.length) {
    throw new Error(`Missing original.jpg/original.png: ${rel(dir)}`);
  }
  if (candidates.length > 1) {
    throw new Error(`Multiple original images found: ${candidates.map(rel).join(', ')}`);
  }
  return candidates[0];
}

function normalizeWork(work, dirName) {
  if (!work || typeof work !== 'object' || Array.isArray(work)) {
    throw new Error(`${dirName}/work.json must be an object.`);
  }

  const id = trim(work.id);
  if (!id) throw new Error(`${dirName}/work.json: id is required.`);
  if (id !== dirName) throw new Error(`${dirName}/work.json: id must match pending directory name.`);
  if (!WORK_ID_PATTERN.test(id)) {
    throw new Error(`${dirName}/work.json: invalid work id "${id}".`);
  }

  const normalized = {
    id,
    title: trim(work.title),
    date: trim(work.date),
    location: trim(work.location),
    production: trim(work.production),
    caption: trim(work.caption),
    modelIds: normalizeModelIds(work.modelIds),
    image: `/images/works/large/${id}.webp`,
    thumbnail: `/images/works/thumbs/${id}.webp`
  };

  ['title', 'date', 'location'].forEach((key) => {
    if (!normalized[key]) throw new Error(`${dirName}/work.json: ${key} is required.`);
  });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.date)) {
    throw new Error(`${dirName}/work.json: date must be YYYY-MM-DD.`);
  }
  if (!normalized.modelIds.length) {
    throw new Error(`${dirName}/work.json: modelIds is required.`);
  }

  return normalized;
}

function validatePendingItems(items, works) {
  const existingIds = new Set(works.map((work) => work?.id).filter(Boolean));
  const pendingIds = new Set();

  items.forEach((item) => {
    if (existingIds.has(item.work.id)) {
      throw new Error(`Duplicate work id in works.json: ${item.work.id}`);
    }
    if (pendingIds.has(item.work.id)) {
      throw new Error(`Duplicate pending work id: ${item.work.id}`);
    }
    pendingIds.add(item.work.id);

    const largePath = path.join(LARGE_DIR, `${item.work.id}.webp`);
    const thumbPath = path.join(THUMB_DIR, `${item.work.id}.webp`);
    if (fs.existsSync(largePath)) throw new Error(`Large image already exists: ${rel(largePath)}`);
    if (fs.existsSync(thumbPath)) throw new Error(`Thumb image already exists: ${rel(thumbPath)}`);
  });
}

async function writeWebpImages(item) {
  const sharp = require('sharp');
  const largePath = path.join(LARGE_DIR, `${item.work.id}.webp`);
  const thumbPath = path.join(THUMB_DIR, `${item.work.id}.webp`);

  await sharp(item.originalPath)
    .rotate()
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(largePath);

  await sharp(item.originalPath)
    .rotate()
    .resize({ width: 700, height: 700, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(thumbPath);
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

function normalizeModelIds(value) {
  if (Array.isArray(value)) return value.map(trim).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map(trim).filter(Boolean);
  return [];
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
