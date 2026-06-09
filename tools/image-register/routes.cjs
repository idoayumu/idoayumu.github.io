const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const sharp = require('sharp');

const router = express.Router();

const ROOT = path.resolve(__dirname, '..', '..');
const WORKS_JSON_PATH = path.join(ROOT, 'src', 'data', 'works.json');
const MODELS_JSON_PATH = path.join(ROOT, 'src', 'data', 'models.json');
const LARGE_DIR = path.join(ROOT, 'public', 'images', 'works', 'large');
const THUMBS_DIR = path.join(ROOT, 'public', 'images', 'works', 'thumbs');

router.use(express.json({ limit: '2mb' }));

// 一時アップロード（アップロードされたコピーのみ使用。元画像は触らない）
const upload = multer({ dest: path.join(__dirname, '.tmp') });

async function ensureDirs() {
  await fsp.mkdir(LARGE_DIR, { recursive: true });
  await fsp.mkdir(THUMBS_DIR, { recursive: true });
}
async function readWorks() {
  try {
    const raw = await fsp.readFile(WORKS_JSON_PATH, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error('works.json is not an array');
    return data;
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}
async function readModels() {
  try {
    const raw = await fsp.readFile(MODELS_JSON_PATH, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error('models.json is not an array');
    return data;
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}
async function writeWorksAtomically(works) {
  const tmpPath = WORKS_JSON_PATH + '.tmp';
  await fsp.mkdir(path.dirname(WORKS_JSON_PATH), { recursive: true });
  await fsp.writeFile(tmpPath, JSON.stringify(works, null, 2), 'utf-8');
  await fsp.rename(tmpPath, WORKS_JSON_PATH);
}
function longEdgeResizeOptions(meta, target) {
  const w = meta.width || 0;
  const h = meta.height || 0;
  return w >= h ? { width: target, withoutEnlargement: true } : { height: target, withoutEnlargement: true };
}

function uniqueNonEmpty(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))].sort();
}

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeModelIds(value) {
  let items;

  if (Array.isArray(value)) {
    items = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) throw new Error('modelIds must be an array');
      items = parsed;
    } else {
      items = trimmed.split(',');
    }
  } else {
    throw new Error('modelIds must be a string or array');
  }

  return [...new Set(items.map(item => asTrimmedString(item)).filter(Boolean))];
}

function workImageAbsPath(imagePath) {
  return path.join(ROOT, 'public', String(imagePath || '').replace(/^\/+/, ''));
}

function getWorkModelIds(work) {
  return Array.isArray(work.modelIds) ? work.modelIds : work.models || [];
}

async function validateModelIds(modelIdsArray) {
  const models = await readModels();
  const modelIdSet = new Set(models.map(model => model.id));
  return modelIdsArray.filter(modelId => !modelIdSet.has(modelId));
}

function buildWorkFields(body) {
  return {
    title: asTrimmedString(body.title),
    date: asTrimmedString(body.date),
    location: asTrimmedString(body.location),
    production: asTrimmedString(body.production),
    caption: asTrimmedString(body.caption)
  };
}

async function writeWorkImages(sourcePath, largeAbs, thumbAbs) {
  const meta = await sharp(sourcePath, { failOn: 'none', unlimited: true }).metadata();

  await sharp(sourcePath, { failOn: 'none', unlimited: true })
    .resize(longEdgeResizeOptions(meta, 2000))
    .webp({ quality: 85 })
    .toFile(largeAbs);

  await sharp(sourcePath, { failOn: 'none', unlimited: true })
    .resize(longEdgeResizeOptions(meta, 700))
    .webp({ quality: 80 })
    .toFile(thumbAbs);
}

async function backupExistingWorkImages(largeAbs, thumbAbs) {
  await Promise.all([largeAbs, thumbAbs].map(async (filePath) => {
    try {
      await fsp.access(filePath, fs.constants.R_OK);
      await fsp.copyFile(filePath, `${filePath}.bak`);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }));
}

router.get('/api/suggestions', async (_req, res) => {
  try {
    const [models, works] = await Promise.all([readModels(), readWorks()]);
    const workCountByModelId = new Map();

    works.forEach((work) => {
      const workModelIds = Array.isArray(work.modelIds)
        ? work.modelIds
        : work.models || [];

      workModelIds.forEach((modelId) => {
        workCountByModelId.set(modelId, (workCountByModelId.get(modelId) || 0) + 1);
      });
    });

    res.json({
      ok: true,
      models: models.map(model => ({
        id: model.id,
        name: model.name || '',
        displayName: model.displayName || '',
        nameKana: model.nameKana || '',
        agency: model.agency || '',
        aliases: Array.isArray(model.aliases) ? model.aliases : [],
        workCount: workCountByModelId.get(model.id) || 0
      })),
      productions: uniqueNonEmpty(works.map(work => work.production)),
      locations: uniqueNonEmpty(works.map(work => work.location)),
      workTitleEntries: works.map(work => ({ id: work.id, title: work.title || '' })).filter(work => work.title),
      workTitles: works.map(work => work.title || '').filter(Boolean)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '候補データを読み込めません。' });
  }
});

router.get('/api/works', async (_req, res) => {
  try {
    const [works, models] = await Promise.all([readWorks(), readModels()]);
    const modelById = new Map(models.map(model => [model.id, model]));

    res.json({
      ok: true,
      works: works.map(work => ({
        ...work,
        modelIds: getWorkModelIds(work),
        modelNames: getWorkModelIds(work)
          .map(modelId => modelById.get(modelId)?.name || modelId)
          .filter(Boolean)
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '作品データを読み込めません。' });
  }
});

async function handleUpdateWork(req, res) {
  let cleanupTemp = null;

  if (req.file) {
    cleanupTemp = async () => {
      try {
        await fsp.unlink(req.file.path);
      } catch { }
    };
  }

  try {
    await ensureDirs();

    const workId = asTrimmedString(req.body.id);
    const { title, date, location, production, caption } = buildWorkFields(req.body);
    const { modelIds, useSourcePath = 'false', sourcePath: bodySourcePath } = req.body;

    if (!workId || !title || !date || !location || !modelIds) {
      return res.status(400).json({ ok: false, message: '必須項目が不足しています。' });
    }

    let modelIdsArray;
    try {
      modelIdsArray = normalizeModelIds(modelIds);
    } catch {
      return res.status(400).json({ ok: false, message: 'modelIds を配列に解釈できません。' });
    }
    if (!modelIdsArray.length) {
      return res.status(400).json({ ok: false, message: 'modelIds は1件以上が必要です。' });
    }

    const works = await readWorks();
    const index = works.findIndex(work => work.id === workId);
    if (index === -1) {
      return res.status(404).json({ ok: false, message: `作品が見つかりません: ${workId}` });
    }

    const unknownModelIds = await validateModelIds(modelIdsArray);
    if (unknownModelIds.length) {
      return res.status(400).json({
        ok: false,
        message: `models.json に存在しないモデルIDです: ${unknownModelIds.join(', ')}`
      });
    }

    const current = works[index];
    const largeRel = current.image || `/images/works/large/${workId}.webp`;
    const thumbRel = current.thumbnail || `/images/works/thumbs/${workId}.webp`;

    let sourcePath = '';
    if (useSourcePath === 'true') {
      const requestedSourcePath = asTrimmedString(bodySourcePath);
      if (!requestedSourcePath) {
        return res.status(400).json({ ok: false, message: 'sourcePath が未指定です。' });
      }
      sourcePath = requestedSourcePath;
      try {
        await fsp.access(sourcePath, fs.constants.R_OK);
      } catch {
        return res.status(400).json({ ok: false, message: 'sourcePath の画像が見つからないか読み取り不可です。' });
      }
    } else if (req.file) {
      sourcePath = req.file.path;
    }

    if (sourcePath) {
      const largeAbs = workImageAbsPath(largeRel);
      const thumbAbs = workImageAbsPath(thumbRel);
      await backupExistingWorkImages(largeAbs, thumbAbs);
      await writeWorkImages(sourcePath, largeAbs, thumbAbs);
    }

    const entry = {
      ...current,
      id: workId,
      title,
      date,
      location,
      production,
      caption,
      modelIds: modelIdsArray,
      image: largeRel,
      thumbnail: thumbRel
    };

    const next = [...works];
    next[index] = entry;
    await writeWorksAtomically(next);

    return res.json({ ok: true, entry });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'サーバエラーが発生しました。' });
  } finally {
    if (cleanupTemp) await cleanupTemp();
  }
}

router.post('/api/register', upload.single('imageFile'), async (req, res) => {
  let cleanupTemp = null;

  if (req.file) {
    cleanupTemp = async () => {
      try {
        await fsp.unlink(req.file.path);
      } catch { }
    };
  }

  try {
    await ensureDirs();

    if (String(req.body.mode || '') === 'edit') {
      return handleUpdateWork(req, res);
    }

    const {
      id, title, date, location, production, caption,
      modelIds, // string | array
      overwrite = 'skip',
      useSourcePath = 'false',
      sourcePath: bodySourcePath
    } = req.body;

    const workId = asTrimmedString(id);
    const workTitle = asTrimmedString(title);
    const workDate = asTrimmedString(date);
    const workLocation = asTrimmedString(location);
    const workProduction = asTrimmedString(production);
    const workCaption = asTrimmedString(caption);

    if (!workId || !workTitle || !workDate || !workLocation || !modelIds) {
      return res.status(400).json({ ok: false, message: '必須項目が不足しています。' });
    }

    if (!/^\d{6}[A-Za-z0-9][A-Za-z0-9_]*_\d{4}$/.test(workId)) {
      return res.status(400).json({
        ok: false,
        message: '作品IDは YYMMDD + モデル名 + _ + 4桁通し番号 の形式で入力してください。'
      });
    }

    let modelIdsArray;
    try {
      modelIdsArray = normalizeModelIds(modelIds);
    } catch {
      return res.status(400).json({ ok: false, message: 'modelIds を配列に解釈できません。' });
    }
    if (!modelIdsArray.length) {
      return res.status(400).json({ ok: false, message: 'modelIds は1件以上が必要です。' });
    }

    const works = await readWorks();
    if (works.some(w => w.id === workId)) {
      return res.status(409).json({ ok: false, message: `既存IDです: ${workId}` });
    }

    const unknownModelIds = await validateModelIds(modelIdsArray);
    if (unknownModelIds.length) {
      return res.status(400).json({
        ok: false,
        message: `models.json に存在しないモデルIDです: ${unknownModelIds.join(', ')}`
      });
    }

    // 画像入力の解決
    let sourcePath;

    if (useSourcePath === 'true') {
      const requestedSourcePath = asTrimmedString(bodySourcePath);
      if (!requestedSourcePath) {
        return res.status(400).json({ ok: false, message: 'sourcePath が未指定です。' });
      }
      sourcePath = requestedSourcePath;
      try {
        await fsp.access(sourcePath, fs.constants.R_OK);
      } catch {
        return res.status(400).json({ ok: false, message: 'sourcePath の画像が見つからないか読み取り不可です。' });
      }
    } else {
      if (!req.file) {
        return res.status(400).json({ ok: false, message: '画像ファイルが未選択です。' });
      }
      sourcePath = req.file.path;
    }

    // 出力先
    const largeRel = `/images/works/large/${workId}.webp`;
    const thumbRel = `/images/works/thumbs/${workId}.webp`;
    const largeAbs = path.join(ROOT, 'public', largeRel);
    const thumbAbs = path.join(ROOT, 'public', thumbRel);

    const largeExists = fs.existsSync(largeAbs);
    const thumbExists = fs.existsSync(thumbAbs);
    if ((largeExists || thumbExists) && overwrite !== 'overwrite') {
      return res.status(409).json({
        ok: false,
        message: '生成済みファイルが存在します（安全のためスキップ）。上書きするには overwrite=overwrite を指定してください。',
        files: { large: largeRel, thumb: thumbRel }
      });
    }

    // 画像生成
    await writeWorkImages(sourcePath, largeAbs, thumbAbs);

    // 登録レコード。元画像の絶対パスは works.json に保存しない。
    const entry = {
      id: workId,
      title: workTitle,
      date: workDate,
      location: workLocation,
      production: workProduction,
      caption: workCaption,
      modelIds: modelIdsArray,
      image: largeRel,
      thumbnail: thumbRel
    };

    // 追記（アトミック）
    const next = [...works, entry];
    await writeWorksAtomically(next);

    return res.json({ ok: true, entry });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'サーバエラーが発生しました。' });
  } finally {
    if (cleanupTemp) await cleanupTemp();
  }
});

router.post('/api/update', upload.single('imageFile'), handleUpdateWork);

module.exports = router;
