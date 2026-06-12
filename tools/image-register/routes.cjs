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
const LARGE_SPEC = '長辺2000px / WebP quality 85';
const THUMB_SPEC = '長辺700px / WebP quality 80';
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

router.use(express.json({ limit: '2mb' }));

// 一時アップロード（アップロードされたコピーのみ使用。元画像は触らない）
const upload = multer({
  dest: path.join(__dirname, '.tmp'),
  limits: {
    fileSize: 30 * 1024 * 1024
  },
  fileFilter(_req, file, cb) {
    const originalName = String(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    if (mime.includes('heic') || mime.includes('heif') || /\.(heic|heif)$/i.test(originalName)) {
      cb(createHttpError(
        415,
        'unsupported_heic',
        'HEIC/HEIF画像は現在非対応です。Lightroomや写真アプリでJPEG、PNG、WebPに変換してから選択してください。'
      ));
      return;
    }
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mime)) {
      cb(createHttpError(
        415,
        'unsupported_image_type',
        '対応している画像形式はJPEG、PNG、WebPです。'
      ));
      return;
    }
    cb(null, true);
  }
});

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
function uniqueNonEmpty(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))].sort();
}

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isHeicPath(value) {
  return /\.(heic|heif)$/i.test(String(value || '').trim());
}

function createHttpError(status, code, message, details = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  err.details = details;
  return err;
}

function sendError(res, err, fallbackCode = 'server_error', fallbackMessage = 'サーバエラーが発生しました。') {
  const status = Number(err.status || 500);
  const code = err.code || fallbackCode;
  const message = err.message || fallbackMessage;
  return res.status(status).json({
    ok: false,
    code,
    message,
    details: err.details || undefined
  });
}

function uploadWorkImage(req, res, next) {
  upload.single('imageFile')(req, res, (err) => {
    if (!err) {
      next();
      return;
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      sendError(res, createHttpError(
        413,
        'image_too_large',
        '画像ファイルが大きすぎます。30MB以下のJPEG、PNG、WebPを選択してください。'
      ));
      return;
    }
    sendError(res, err);
  });
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
  try {
    await sharp(sourcePath, { failOn: 'none', unlimited: true })
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(largeAbs);

    await sharp(sourcePath, { failOn: 'none', unlimited: true })
      .rotate()
      .resize({ width: 700, height: 700, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(thumbAbs);
  } catch (err) {
    throw createHttpError(
      500,
      'image_conversion_failed',
      '画像変換に失敗しました。JPEG、PNG、WebPのいずれかに変換してから再度試してください。',
      { cause: err.message, large: largeAbs, thumb: thumbAbs }
    );
  }
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
        return sendError(res, createHttpError(400, 'missing_source_path', 'sourcePath が未指定です。'));
      }
      if (isHeicPath(requestedSourcePath)) {
        return sendError(res, createHttpError(415, 'unsupported_heic', 'HEIC/HEIF画像は現在非対応です。JPEG、PNG、WebPに変換してから指定してください。'));
      }
      sourcePath = requestedSourcePath;
      try {
        await fsp.access(sourcePath, fs.constants.R_OK);
      } catch {
        return sendError(res, createHttpError(400, 'source_path_unreadable', 'sourcePath の画像が見つからないか読み取り不可です。'));
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
    try {
      await writeWorksAtomically(next);
    } catch (err) {
      throw createHttpError(
        500,
        'works_json_update_failed',
        'works.json の更新に失敗しました。画像を更新している場合は .bak 退避ファイルを確認してください。',
        { cause: err.message }
      );
    }

    return res.json({
      ok: true,
      entry,
      savedFiles: {
        large: sourcePath ? largeRel : '',
        thumb: sourcePath ? thumbRel : '',
        worksJson: 'src/data/works.json'
      },
      specs: {
        large: LARGE_SPEC,
        thumb: THUMB_SPEC
      }
    });
  } catch (err) {
    console.error(err);
    return sendError(res, err);
  } finally {
    if (cleanupTemp) await cleanupTemp();
  }
}

router.post('/api/register', uploadWorkImage, async (req, res) => {
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
      return sendError(res, createHttpError(400, 'missing_required_fields', '必須項目が不足しています。タイトル、撮影日、撮影場所、モデル、作品IDを確認してください。'));
    }

    if (!/^\d{6}[A-Za-z0-9][A-Za-z0-9_-]*_\d{4}$/.test(workId)) {
      return sendError(res, createHttpError(400, 'invalid_work_id', '作品IDは YYMMDD + モデル名 + _ + 4桁通し番号 の形式で入力してください。'));
    }

    let modelIdsArray;
    try {
      modelIdsArray = normalizeModelIds(modelIds);
    } catch {
      return sendError(res, createHttpError(400, 'invalid_model_ids', 'modelIds を配列に解釈できません。モデル選択を確認してください。'));
    }
    if (!modelIdsArray.length) {
      return sendError(res, createHttpError(400, 'missing_model_ids', 'モデルを1件以上選択してください。'));
    }

    const works = await readWorks();
    if (works.some(w => w.id === workId)) {
      return sendError(res, createHttpError(409, 'duplicate_work_id', `既存IDです: ${workId}。通し番号を変更してください。`));
    }

    const unknownModelIds = await validateModelIds(modelIdsArray);
    if (unknownModelIds.length) {
      return sendError(res, createHttpError(400, 'unknown_model_ids', `models.json に存在しないモデルIDです: ${unknownModelIds.join(', ')}`));
    }

    // 画像入力の解決
    let sourcePath;

    if (useSourcePath === 'true') {
      const requestedSourcePath = asTrimmedString(bodySourcePath);
      if (!requestedSourcePath) {
        return sendError(res, createHttpError(400, 'missing_source_path', 'sourcePath が未指定です。'));
      }
      if (isHeicPath(requestedSourcePath)) {
        return sendError(res, createHttpError(415, 'unsupported_heic', 'HEIC/HEIF画像は現在非対応です。JPEG、PNG、WebPに変換してから指定してください。'));
      }
      sourcePath = requestedSourcePath;
      try {
        await fsp.access(sourcePath, fs.constants.R_OK);
      } catch {
        return sendError(res, createHttpError(400, 'source_path_unreadable', 'sourcePath の画像が見つからないか読み取り不可です。'));
      }
    } else {
      if (!req.file) {
        return sendError(res, createHttpError(400, 'missing_image_file', '画像ファイルを選択してください。'));
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
      return sendError(res, createHttpError(
        409,
        'image_files_already_exist',
        '同名の生成済み画像ファイルが存在します。作品IDまたは通し番号を確認してください。上書きする場合のみ上書き設定を変更してください。',
        { files: { large: largeRel, thumb: thumbRel }, specs: { large: LARGE_SPEC, thumb: THUMB_SPEC } }
      ));
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
    try {
      await writeWorksAtomically(next);
    } catch (err) {
      await Promise.all([largeAbs, thumbAbs].map(async (filePath) => {
        try {
          await fsp.unlink(filePath);
        } catch { }
      }));
      throw createHttpError(
        500,
        'works_json_update_failed',
        'works.json の更新に失敗しました。生成済み画像は削除しました。もう一度実行してください。',
        { cause: err.message }
      );
    }

    return res.json({
      ok: true,
      entry,
      savedFiles: {
        large: largeRel,
        thumb: thumbRel,
        worksJson: 'src/data/works.json'
      },
      specs: {
        large: LARGE_SPEC,
        thumb: THUMB_SPEC
      }
    });
  } catch (err) {
    console.error(err);
    return sendError(res, err);
  } finally {
    if (cleanupTemp) await cleanupTemp();
  }
});

router.post('/api/update', uploadWorkImage, handleUpdateWork);

module.exports = router;
