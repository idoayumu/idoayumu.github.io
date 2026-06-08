const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WORKS_JSON = path.join(ROOT, 'src', 'data', 'works.json');
const MODELS_JSON = path.join(ROOT, 'src', 'data', 'models.json');
const PUBLIC_IMAGES = path.join(ROOT, 'public', 'images');
const WORKS_LARGE = path.join(PUBLIC_IMAGES, 'works', 'large');
const WORKS_THUMBS = path.join(PUBLIC_IMAGES, 'works', 'thumbs');
const MODELS_IMAGES = path.join(PUBLIC_IMAGES, 'models');
const TOOLS_DIR = path.join(ROOT, 'tools');

const LARGE_LIMIT = 2 * 1024 * 1024;
const THUMB_LIMIT = 500 * 1024;

const errors = [];
const warnings = [];

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function readJson(filePath, label) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(data)) addError(`${label} must be an array`);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    addError(`${label} could not be read: ${err.message}`);
    return [];
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function publicPathToAbs(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().replace(/^\/+/, '');
  if (!normalized.startsWith('images/')) return null;
  return path.join(ROOT, 'public', normalized);
}

function basenameWithoutExt(value) {
  return path.basename(value, path.extname(value));
}

function checkDuplicateIds(items, label) {
  const seen = new Map();
  items.forEach((item, index) => {
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id) return;
    if (seen.has(id)) {
      addError(`${label}: duplicate id "${id}" at indexes ${seen.get(id)} and ${index}`);
    } else {
      seen.set(id, index);
    }
  });
}

function checkRequiredString(item, key, label) {
  if (typeof item[key] !== 'string' || !item[key].trim()) {
    addError(`${label}: "${key}" is required`);
  }
}

function checkImageReference(value, label, referencedImages) {
  if (typeof value !== 'string' || !value.trim()) {
    addError(`${label}: image path is required`);
    return null;
  }

  const absPath = publicPathToAbs(value);
  if (!absPath) {
    addError(`${label}: "${value}" must point under /images/`);
    return null;
  }

  if (!rel(absPath).startsWith('public/images/')) {
    addError(`${label}: "${value}" must resolve under public/images/`);
    return null;
  }

  referencedImages.add(rel(absPath));
  if (!fs.existsSync(absPath)) {
    addError(`${label}: missing file ${rel(absPath)}`);
  }
  return absPath;
}

function checkLinks(model) {
  if (model.links == null) return;
  if (Array.isArray(model.links)) {
    model.links.forEach((item, index) => {
      if (typeof item !== 'string' && !isObject(item)) {
        addWarning(`models.json:${model.id}: links[${index}] should be a URL string or object`);
      }
    });
    return;
  }
  if (!isObject(model.links)) {
    addWarning(`models.json:${model.id}: links should be an object or array`);
    return;
  }
  ['instagram', 'x', 'twitter', 'threads', 'website'].forEach((key) => {
    if (model.links[key] != null && typeof model.links[key] !== 'string') {
      addWarning(`models.json:${model.id}: links.${key} should be a string`);
    }
  });
}

function checkFileSizes() {
  walk(WORKS_LARGE).forEach((filePath) => {
    const stat = fs.statSync(filePath);
    if (stat.size > LARGE_LIMIT) {
      addWarning(`large image exceeds 2MB: ${rel(filePath)} (${formatSize(stat.size)})`);
    }
  });

  walk(WORKS_THUMBS).forEach((filePath) => {
    const stat = fs.statSync(filePath);
    if (stat.size > THUMB_LIMIT) {
      addWarning(`thumb image exceeds 500KB: ${rel(filePath)} (${formatSize(stat.size)})`);
    }
  });

  walk(PUBLIC_IMAGES).forEach((filePath) => {
    if (!/\.(jpe?g)$/i.test(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.size > LARGE_LIMIT) {
      addWarning(`large jpg under public/images: ${rel(filePath)} (${formatSize(stat.size)})`);
    }
  });
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

function checkDsStore() {
  walk(ROOT).forEach((filePath) => {
    const relative = rel(filePath);
    if (relative.includes('node_modules/') || relative.includes('.git/')) return;
    if (path.basename(filePath) === '.DS_Store') {
      addWarning(`unnecessary file exists: ${relative}`);
    }
  });
}

function checkTmpFiles() {
  if (!fs.existsSync(TOOLS_DIR)) return;
  fs.readdirSync(TOOLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .forEach((entry) => {
      const tmpDir = path.join(TOOLS_DIR, entry.name, '.tmp');
      walk(tmpDir).forEach((filePath) => {
        addWarning(`temporary file remains: ${rel(filePath)}`);
      });
    });
}

const works = readJson(WORKS_JSON, 'works.json');
const models = readJson(MODELS_JSON, 'models.json');
const modelIds = new Set(models.map((model) => model.id).filter(Boolean));
const referencedImages = new Set();

checkDuplicateIds(works, 'works.json');
checkDuplicateIds(models, 'models.json');

works.forEach((work, index) => {
  const label = `works.json:${work.id || `index ${index}`}`;
  checkRequiredString(work, 'id', label);
  checkRequiredString(work, 'title', label);
  checkRequiredString(work, 'date', label);
  checkRequiredString(work, 'location', label);

  if (Object.prototype.hasOwnProperty.call(work, 'sourcePath')) {
    addError(`${label}: sourcePath must not be saved`);
  }

  if (!Array.isArray(work.modelIds) || !work.modelIds.length) {
    addError(`${label}: modelIds is required and must be a non-empty array`);
  } else {
    work.modelIds.forEach((modelId) => {
      if (typeof modelId !== 'string' || !modelId.trim()) {
        addError(`${label}: modelIds contains an empty or non-string value`);
      } else if (!modelIds.has(modelId)) {
        addError(`${label}: unknown modelId "${modelId}"`);
      }
    });
  }

  const imageAbs = checkImageReference(work.image, `${label}: image`, referencedImages);
  const thumbAbs = checkImageReference(work.thumbnail, `${label}: thumbnail`, referencedImages);

  [
    ['image', imageAbs],
    ['thumbnail', thumbAbs],
  ].forEach(([key, absPath]) => {
    if (work.id && absPath && basenameWithoutExt(absPath) !== work.id) {
      addWarning(`${label}: ${key} filename "${path.basename(absPath)}" does not match id "${work.id}"`);
    }
  });
});

models.forEach((model, index) => {
  const label = `models.json:${model.id || `index ${index}`}`;
  checkRequiredString(model, 'id', label);
  checkRequiredString(model, 'name', label);

  const imageName = model.thumbnail || model.profileImage;
  if (typeof imageName !== 'string' || !imageName.trim()) {
    addError(`${label}: thumbnail or profileImage is required`);
  } else {
    const imageAbs = imageName.startsWith('/images/')
      ? publicPathToAbs(imageName)
      : path.join(MODELS_IMAGES, imageName);
    referencedImages.add(rel(imageAbs));
    if (!fs.existsSync(imageAbs)) {
      addError(`${label}: missing model image ${rel(imageAbs)}`);
    }
  }

  checkLinks(model);

  if (model.featured != null && typeof model.featured !== 'boolean') {
    addWarning(`${label}: featured should be boolean when present`);
  }

  if (
    model.profileImagePosition != null
    && !['left center', 'center', 'right center'].includes(model.profileImagePosition)
  ) {
    addWarning(`${label}: profileImagePosition should be "left center", "center", or "right center"`);
  }
});

[WORKS_LARGE, WORKS_THUMBS, MODELS_IMAGES].forEach((dir) => {
  walk(dir).forEach((filePath) => {
    if (path.basename(filePath) === '.DS_Store') return;
    const relative = rel(filePath);
    if (!referencedImages.has(relative)) {
      addWarning(`orphan image is not referenced by JSON: ${relative}`);
    }
  });
});

checkFileSizes();
checkDsStore();
checkTmpFiles();

console.log(`Data validation checked ${works.length} works and ${models.length} models.`);

if (warnings.length) {
  console.log(`\nWarnings (${warnings.length}):`);
  warnings.forEach((warning) => console.log(`- ${warning}`));
}

if (errors.length) {
  console.error(`\nErrors (${errors.length}):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('\nNo validation errors found.');
