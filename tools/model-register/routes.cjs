const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const sharp = require('sharp');

const router = express.Router();

const ROOT = path.resolve(__dirname, '..', '..');
const MODELS_JSON_PATH = path.join(ROOT, 'src', 'data', 'models.json');
const MODELS_IMAGE_DIR = path.join(ROOT, 'public', 'images', 'models');

router.use(express.json({ limit: '2mb' }));

const upload = multer({ dest: path.join(__dirname, '.tmp') });

async function ensureDirs() {
  await fsp.mkdir(MODELS_IMAGE_DIR, { recursive: true });
}

async function readModels() {
  try {
    const raw = await fsp.readFile(MODELS_JSON_PATH, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error('models.json is not an array');
    return data;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeModelsAtomically(models) {
  const tmpPath = `${MODELS_JSON_PATH}.tmp`;
  await fsp.writeFile(tmpPath, `${JSON.stringify(models, null, 2)}\n`, 'utf-8');
  await fsp.rename(tmpPath, MODELS_JSON_PATH);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[ァ-ン]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[\s\-_・.．。/／\\|｜]+/g, '');
}

function levenshtein(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return rows[a.length][b.length];
}

function parseAliases(value) {
  if (!value) return [];
  return String(value)
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSocialUrl(value, service) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const handle = raw.replace(/^@/, '');
  if (!handle) return '';
  if (service === 'x') return `https://x.com/${handle}`;
  if (service === 'instagram') return `https://www.instagram.com/${handle}/`;
  if (service === 'threads') return `https://www.threads.net/@${handle}`;
  if (service === 'website') return `https://${raw}`;
  return raw;
}

function findSimilarModels(models, name, aliases, excludeId = '') {
  const candidates = [name, ...aliases]
    .map(normalizeText)
    .filter(Boolean);
  const warnings = [];

  for (const model of models) {
    if (excludeId && model.id === excludeId) continue;

    const existingNames = [
      model.name,
      model.displayName,
      model.nameKana,
      ...(Array.isArray(model.aliases) ? model.aliases : [])
    ]
      .map(normalizeText)
      .filter(Boolean);

    for (const candidate of candidates) {
      for (const existing of existingNames) {
        if (!candidate || !existing) continue;
        const exact = candidate === existing;
        const contains = candidate.length >= 2 && existing.length >= 2
          && (candidate.includes(existing) || existing.includes(candidate));
        const close = Math.max(candidate.length, existing.length) <= 8
          && levenshtein(candidate, existing) <= 1;

        if (exact || contains || close) {
          warnings.push({
            id: model.id,
            name: model.name,
            agency: model.agency || '',
            matched: exact ? 'exact' : contains ? 'contains' : 'similar'
          });
          break;
        }
      }
    }
  }

  return warnings.filter((warning, index, array) =>
    array.findIndex((item) => item.id === warning.id) === index
  );
}

function validateId(id) {
  return /^[a-z0-9][a-z0-9_-]*$/.test(id);
}

function normalizeProfileImagePosition(value) {
  if (value === 'left') return 'left center';
  if (value === 'right') return 'right center';
  if (value === 'left center' || value === 'right center') return value;
  return 'center';
}

function modelImageAbsPath(imageName) {
  if (String(imageName || '').startsWith('/images/')) {
    return path.join(ROOT, 'public', String(imageName).replace(/^\/+/, ''));
  }
  return path.join(MODELS_IMAGE_DIR, imageName);
}

function buildModelFields(body, fallback = {}) {
  const formalName = String(body.name || '').trim();
  const shortDisplayName = String(body.displayName || formalName || '').trim();

  return {
    name: formalName,
    displayName: shortDisplayName,
    nameKana: String(body.nameKana || '').trim(),
    aliases: parseAliases(body.aliases),
    agency: String(body.agency || '').trim(),
    profileImagePosition: normalizeProfileImagePosition(body.profileImagePosition || fallback.profileImagePosition || 'center'),
    links: {
      instagram: normalizeSocialUrl(body.instagram, 'instagram'),
      x: normalizeSocialUrl(body.x, 'x'),
      threads: normalizeSocialUrl(body.threads, 'threads'),
      website: normalizeSocialUrl(body.website, 'website')
    }
  };
}

async function writeProfileImage(sourcePath, targetPath) {
  await sharp(sourcePath, { failOn: 'none', unlimited: true })
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 84 })
    .toFile(targetPath);
}

router.get('/api/models', async (_req, res) => {
  try {
    const models = await readModels();
    res.json({ ok: true, models });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'models.json を読み込めません。' });
  }
});

async function handleUpdateModel(req, res) {
  let cleanupTemp = null;

  try {
    await ensureDirs();

    const modelId = String(req.body.id || '').trim();
    const force = String(req.body.force || 'false');

    if (!modelId) {
      return res.status(400).json({ ok: false, message: 'モデルIDが未指定です。' });
    }

    if (req.file) {
      cleanupTemp = async () => {
        try {
          await fsp.unlink(req.file.path);
        } catch {}
      };
    }

    const models = await readModels();
    const index = models.findIndex((model) => model.id === modelId);
    if (index === -1) {
      if (cleanupTemp) await cleanupTemp();
      return res.status(404).json({ ok: false, message: `モデルが見つかりません: ${modelId}` });
    }

    const current = models[index];
    const fields = buildModelFields(req.body, current);

    if (!fields.name) {
      if (cleanupTemp) await cleanupTemp();
      return res.status(400).json({ ok: false, message: '表示名は必須です。' });
    }

    const warnings = findSimilarModels(models, fields.name, [
      fields.displayName,
      fields.nameKana,
      ...fields.aliases
    ], modelId);

    if (warnings.length && force !== 'true') {
      if (cleanupTemp) await cleanupTemp();
      return res.status(409).json({
        ok: false,
        needsConfirmation: true,
        message: '似ている名前のモデルが見つかりました。確認してから保存してください。',
        warnings
      });
    }

    const thumbnail = current.thumbnail || current.profileImage || `${modelId}_profile.webp`;
    if (req.file) {
      await writeProfileImage(req.file.path, modelImageAbsPath(thumbnail));
      await cleanupTemp();
      cleanupTemp = null;
    }

    const entry = {
      ...current,
      name: fields.name,
      displayName: fields.displayName,
      nameKana: fields.nameKana,
      aliases: fields.aliases,
      agency: fields.agency,
      thumbnail,
      profileImagePosition: fields.profileImagePosition,
      links: fields.links
    };

    const next = [...models];
    next[index] = entry;
    await writeModelsAtomically(next);

    return res.json({ ok: true, entry, warnings });
  } catch (err) {
    if (cleanupTemp) await cleanupTemp();
    console.error(err);
    return res.status(500).json({ ok: false, message: 'サーバエラーが発生しました。' });
  }
}

router.post('/api/register', upload.single('profileImage'), async (req, res) => {
  let cleanupTemp = null;

  try {
    await ensureDirs();

    if (String(req.body.mode || '') === 'edit') {
      return handleUpdateModel(req, res);
    }

    const {
      id,
      name,
      nameKana = '',
      agency = '',
      x = '',
      instagram = '',
      threads = '',
      website = '',
      aliases = '',
      profileImagePosition = 'center',
      force = 'false'
    } = req.body;

    const modelId = String(id || '').trim();
    const fields = buildModelFields(req.body);
    const formalName = fields.name;

    if (!modelId || !formalName) {
      return res.status(400).json({ ok: false, message: 'モデルIDと表示名は必須です。' });
    }
    if (!validateId(modelId)) {
      return res.status(400).json({
        ok: false,
        message: 'モデルIDは半角英数字、小文字、ハイフン、アンダースコアで入力してください。'
      });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, message: 'プロフィール画像を選択してください。' });
    }

    cleanupTemp = async () => {
      try {
        await fsp.unlink(req.file.path);
      } catch {}
    };

    const models = await readModels();
    if (models.some((model) => model.id === modelId)) {
      await cleanupTemp();
      return res.status(409).json({ ok: false, message: `既存IDです: ${modelId}` });
    }

    const warnings = findSimilarModels(models, formalName, [
      fields.displayName,
      fields.nameKana,
      ...fields.aliases
    ]);
    if (warnings.length && force !== 'true') {
      await cleanupTemp();
      return res.status(409).json({
        ok: false,
        needsConfirmation: true,
        message: '似ている名前のモデルが見つかりました。確認してから登録してください。',
        warnings
      });
    }

    const thumbnail = `${modelId}_profile.webp`;
    const imageAbs = path.join(MODELS_IMAGE_DIR, thumbnail);

    if (fs.existsSync(imageAbs)) {
      await cleanupTemp();
      return res.status(409).json({ ok: false, message: `画像ファイルが既に存在します: ${thumbnail}` });
    }

    await writeProfileImage(req.file.path, imageAbs);

    await cleanupTemp();

    const entry = {
      id: modelId,
      name: fields.name,
      displayName: fields.displayName,
      nameKana: fields.nameKana,
      nameEn: '',
      aliases: fields.aliases,
      agency: fields.agency,
      bio: '',
      thumbnail,
      profileImagePosition: fields.profileImagePosition,
      links: fields.links,
      featured: true
    };

    await writeModelsAtomically([...models, entry]);

    return res.json({ ok: true, entry, warnings });
  } catch (err) {
    if (cleanupTemp) await cleanupTemp();
    console.error(err);
    return res.status(500).json({ ok: false, message: 'サーバエラーが発生しました。' });
  }
});

router.post('/api/update', upload.single('profileImage'), handleUpdateModel);

router.use((err, _req, res, _next) => {
  console.error(err);
  return res.status(500).json({
    ok: false,
    message: `サーバエラーが発生しました。${err.message ? ` ${err.message}` : ''}`
  });
});

module.exports = router;
