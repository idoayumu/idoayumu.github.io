// tools/image-register/server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const sharp = require('sharp');

const app = express();
const PORT = 3000;

const ROOT = path.resolve(process.cwd());
// ここをユーザー環境に合わせる（指定どおり）
const WORKS_JSON_PATH = path.join(ROOT, 'src', 'data', 'works.json');
const LARGE_DIR = path.join(ROOT, 'public', 'images', 'works', 'large');
const THUMBS_DIR = path.join(ROOT, 'public', 'images', 'works', 'thumbs');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '2mb' }));

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

app.post('/api/register', upload.single('imageFile'), async (req, res) => {
  try {
    await ensureDirs();

    const {
      id, title, date, location, production, caption,
      modelIds, // string | array
      overwrite = 'skip',
      useSourcePath = 'false',
      sourcePath: bodySourcePath
    } = req.body;

    // 必須
    if (!id || !title || !date || !location || !production || !modelIds) {
      return res.status(400).json({ ok: false, message: '必須項目が不足しています。' });
    }

    // modelIds 正規化（常に配列）
    let modelIdsArray;
    try {
      if (Array.isArray(modelIds)) {
        modelIdsArray = modelIds;
      } else if (typeof modelIds === 'string' && modelIds.trim().startsWith('[')) {
        modelIdsArray = JSON.parse(modelIds);
      } else if (typeof modelIds === 'string') {
        modelIdsArray = modelIds.split(',').map(s => s.trim()).filter(Boolean);
      } else {
        throw new Error('modelIds format error');
      }
    } catch {
      return res.status(400).json({ ok: false, message: 'modelIds を配列に解釈できません。' });
    }
    if (!modelIdsArray.length) {
      return res.status(400).json({ ok: false, message: 'modelIds は1件以上が必要です。' });
    }

    // 画像入力の解決
    let sourcePath;
    let cleanupTemp = null;

    if (useSourcePath === 'true') {
      if (!bodySourcePath) {
        return res.status(400).json({ ok: false, message: 'sourcePath が未指定です。' });
      }
      sourcePath = bodySourcePath;
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
      cleanupTemp = async () => { try { await fsp.unlink(req.file.path); } catch { } };
    }

    // works.json 読み込み
    const works = await readWorks();
    if (works.some(w => w.id === id)) {
      if (cleanupTemp) await cleanupTemp();
      return res.status(409).json({ ok: false, message: `既存IDです: ${id}` });
    }

    // 出力先
    const largeRel = `/images/works/large/${id}.webp`;
    const thumbRel = `/images/works/thumbs/${id}.webp`;
    const largeAbs = path.join(ROOT, 'public', largeRel);
    const thumbAbs = path.join(ROOT, 'public', thumbRel);

    const largeExists = fs.existsSync(largeAbs);
    const thumbExists = fs.existsSync(thumbAbs);
    if ((largeExists || thumbExists) && overwrite !== 'overwrite') {
      if (cleanupTemp) await cleanupTemp();
      return res.status(409).json({
        ok: false,
        message: '生成済みファイルが存在します（安全のためスキップ）。上書きするには overwrite=overwrite を指定してください。',
        files: { large: largeRel, thumb: thumbRel }
      });
    }

    // 画像生成
    const meta = await sharp(sourcePath, { failOn: 'none', unlimited: true }).metadata();

    await sharp(sourcePath, { failOn: 'none', unlimited: true })
      .resize(longEdgeResizeOptions(meta, 2000))
      .webp({ quality: 85 })
      .toFile(largeAbs);

    await sharp(sourcePath, { failOn: 'none', unlimited: true })
      .resize(longEdgeResizeOptions(meta, 700))
      .webp({ quality: 80 })
      .toFile(thumbAbs);

    if (cleanupTemp) await cleanupTemp();

    // 登録レコード（要件の形式）
    const entry = {
      id,
      title,
      date,
      location,
      production,
      caption: caption || '',
      modelIds: modelIdsArray,
      sourcePath,
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
  }
});

app.listen(PORT, () => {
  console.log(`Image register tool running at http://localhost:${PORT}`);
});
