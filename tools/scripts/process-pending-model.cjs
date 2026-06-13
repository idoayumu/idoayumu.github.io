const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PENDING_ROOT = path.join(ROOT, 'tools', 'admin', 'uploads', 'models', 'pending');
const MODELS_JSON = path.join(ROOT, 'src', 'data', 'models.json');
const ADMIN_MODELS_JSON = path.join(ROOT, 'tools', 'admin', 'public', 'data', 'models.json');
const MODELS_IMAGE_DIR = path.join(ROOT, 'public', 'images', 'models');
const MODEL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isDryRun = process.argv.includes('--dry-run');

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

async function main() {
  const pendingItems = readPendingItems();
  if (!pendingItems.length) {
    console.log('No pending models found.');
    setGithubOutput({
      changed: 'false',
      commit_message: 'Process pending models'
    });
    return;
  }

  const models = readJson(MODELS_JSON, 'src/data/models.json');
  validatePendingItems(pendingItems, models);

  console.log(`Pending models: ${pendingItems.map((item) => item.model.id).join(', ')}`);

  if (isDryRun) {
    console.log('Dry-run completed. No files were changed.');
    return;
  }

  fs.mkdirSync(MODELS_IMAGE_DIR, { recursive: true });

  for (const item of pendingItems) {
    await writeProfileImage(item);
  }

  const nextModels = [
    ...models,
    ...pendingItems.map((item) => item.model)
  ];
  writeJson(MODELS_JSON, nextModels);
  writeJson(ADMIN_MODELS_JSON, nextModels);

  for (const item of pendingItems) {
    fs.rmSync(item.dir, { recursive: true, force: true });
  }

  setGithubOutput({
    changed: 'true',
    commit_message: pendingItems.length === 1
      ? `Process pending model ${pendingItems[0].model.id}`
      : `Process ${pendingItems.length} pending models`
  });

  console.log(`Processed ${pendingItems.length} pending model(s).`);
}

function readPendingItems() {
  if (!fs.existsSync(PENDING_ROOT)) return [];

  return fs.readdirSync(PENDING_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(PENDING_ROOT, entry.name);
      const modelJsonPath = path.join(dir, 'model.json');
      if (!fs.existsSync(modelJsonPath)) {
        throw new Error(`Missing model.json: ${rel(modelJsonPath)}`);
      }

      const originalPath = findOriginalImage(dir);
      const pendingModel = readJson(modelJsonPath, rel(modelJsonPath));
      return {
        dir,
        modelJsonPath,
        originalPath,
        model: normalizeModel(pendingModel, entry.name)
      };
    })
    .sort((a, b) => a.model.id.localeCompare(b.model.id));
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

function normalizeModel(model, dirName) {
  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    throw new Error(`${dirName}/model.json must be an object.`);
  }

  const id = trim(model.id);
  if (!id) throw new Error(`${dirName}/model.json: id is required.`);
  if (id !== dirName) throw new Error(`${dirName}/model.json: id must match pending directory name.`);
  if (!MODEL_ID_PATTERN.test(id)) {
    throw new Error(`${dirName}/model.json: invalid model id "${id}".`);
  }

  const name = trim(model.name);
  if (!name) throw new Error(`${dirName}/model.json: name is required.`);

  const thumbnail = `${id}_profile.webp`;
  return {
    id,
    name,
    displayName: trim(model.shortName) || name,
    nameKana: trim(model.yomi),
    nameEn: '',
    aliases: [],
    agency: trim(model.agency),
    bio: '',
    thumbnail,
    profileImage: thumbnail,
    profileImagePosition: 'center',
    links: {
      instagram: trim(model.instagram),
      x: trim(model.x),
      threads: trim(model.threads),
      website: trim(model.otherUrl),
      websiteLabel: trim(model.otherLabel)
    },
    featured: true
  };
}

function validatePendingItems(items, models) {
  const existingIds = new Set(models.map((model) => model?.id).filter(Boolean));
  const pendingIds = new Set();

  items.forEach((item) => {
    if (existingIds.has(item.model.id)) {
      throw new Error(`Duplicate model id in models.json: ${item.model.id}`);
    }
    if (pendingIds.has(item.model.id)) {
      throw new Error(`Duplicate pending model id: ${item.model.id}`);
    }
    pendingIds.add(item.model.id);

    const imagePath = path.join(MODELS_IMAGE_DIR, item.model.thumbnail);
    if (fs.existsSync(imagePath)) throw new Error(`Model image already exists: ${rel(imagePath)}`);
  });
}

async function writeProfileImage(item) {
  const sharp = require('sharp');
  const imagePath = path.join(MODELS_IMAGE_DIR, item.model.thumbnail);

  await sharp(item.originalPath, { failOn: 'none', unlimited: true })
    .rotate()
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(imagePath);
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
