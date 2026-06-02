const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const sharp = require('sharp');

const app = express();
const PORT = 3001;
const HOST = '127.0.0.1';

const ROOT = path.resolve(__dirname, '..', '..');
const MODELS_JSON_PATH = path.join(ROOT, 'src', 'data', 'models.json');
const MODELS_IMAGE_DIR = path.join(ROOT, 'public', 'images', 'models');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '2mb' }));

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
    .split(/[\n,、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSocialUrl(value, service) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const handle = raw.replace(/^@/, '');
  if (!handle) return '';
  if (service === 'instagram') return `https://www.instagram.com/${handle}/`;
  if (service === 'twitter') return `https://x.com/${handle}`;
  return raw;
}

function findSimilarModels(models, name, aliases) {
  const candidates = [name, ...aliases]
    .map(normalizeText)
    .filter(Boolean);
  const warnings = [];

  for (const model of models) {
    const existingNames = [model.name, ...(Array.isArray(model.aliases) ? model.aliases : [])]
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

app.get('/api/models', async (_req, res) => {
  try {
    const models = await readModels();
    res.json({ ok: true, models });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'models.json を読み込めません。' });
  }
});

app.post('/api/register', upload.single('profileImage'), async (req, res) => {
  let cleanupTemp = null;

  try {
    await ensureDirs();

    const {
      id,
      name,
      agency = '',
      twitter = '',
      instagram = '',
      aliases = '',
      force = 'false'
    } = req.body;

    const modelId = String(id || '').trim();
    const displayName = String(name || '').trim();
    const aliasList = parseAliases(aliases);

    if (!modelId || !displayName) {
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

    const warnings = findSimilarModels(models, displayName, aliasList);
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

    await sharp(req.file.path, { failOn: 'none', unlimited: true })
      .resize({ width: 900, height: 900, fit: 'cover', position: 'attention', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(imageAbs);

    await cleanupTemp();

    const entry = {
      id: modelId,
      name: displayName,
      nameKana: '',
      nameEn: '',
      aliases: aliasList,
      agency: String(agency || '').trim(),
      bio: '',
      thumbnail,
      links: {
        instagram: normalizeSocialUrl(instagram, 'instagram'),
        twitter: normalizeSocialUrl(twitter, 'twitter'),
        website: ''
      },
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

app.listen(PORT, HOST, () => {
  console.log(`Model register tool running at http://${HOST}:${PORT}`);
});
