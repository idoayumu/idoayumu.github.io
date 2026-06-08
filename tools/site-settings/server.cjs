const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const sharp = require('sharp');

const app = express();
const PORT = Number(process.env.PORT || 3002);
const HOST = process.env.HOST || '127.0.0.1';

const ROOT = path.resolve(__dirname, '..', '..');
const SETTINGS_JSON_PATH = path.join(ROOT, 'src', 'data', 'site-settings.json');
const ABOUT_IMAGE_DIR = path.join(ROOT, 'public', 'images', 'site', 'about');
const TMP_DIR = path.join(__dirname, '.tmp');
const FALLBACK_ABOUT_IMAGE = '/images/site/about/2026_spring_001.webp';
const FALLBACK_ABOUT_IMAGE_MEMO = '水瀬あおい';
const SEASONS = new Set(['spring', 'summer', 'autumn', 'winter', 'special']);
const MAX_MEMO_LENGTH = 30;
const MAX_MEMO_LINES = 3;

app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(ROOT, 'public', 'images')));
app.use(express.json({ limit: '2mb' }));

fs.mkdirSync(TMP_DIR, { recursive: true });

const upload = multer({ dest: TMP_DIR });

async function ensureDirs() {
  await fsp.mkdir(ABOUT_IMAGE_DIR, { recursive: true });
  await fsp.mkdir(path.dirname(SETTINGS_JSON_PATH), { recursive: true });
  await fsp.mkdir(TMP_DIR, { recursive: true });
}

async function readSettings() {
  try {
    const raw = await fsp.readFile(SETTINGS_JSON_PATH, 'utf-8');
    const data = JSON.parse(raw);
    const aboutImage = data.aboutImage || FALLBACK_ABOUT_IMAGE;
    const aboutImageMemo = data.aboutImageMemo || (aboutImage === FALLBACK_ABOUT_IMAGE ? FALLBACK_ABOUT_IMAGE_MEMO : '');
    return {
      aboutImage,
      aboutImageSeason: data.aboutImageSeason || '',
      aboutImageYear: data.aboutImageYear || null,
      aboutImageMemo
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        aboutImage: FALLBACK_ABOUT_IMAGE,
        aboutImageSeason: '',
        aboutImageYear: null,
        aboutImageMemo: FALLBACK_ABOUT_IMAGE_MEMO
      };
    }
    throw err;
  }
}

async function writeSettings(settings) {
  const tmpPath = `${SETTINGS_JSON_PATH}.tmp`;
  await fsp.writeFile(tmpPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8');
  await fsp.rename(tmpPath, SETTINGS_JSON_PATH);
}

function nextAboutImageName(year, season) {
  const pattern = new RegExp(`^${year}_${season}_(\\d{3})\\.webp$`);
  const numbers = fs.existsSync(ABOUT_IMAGE_DIR)
    ? fs.readdirSync(ABOUT_IMAGE_DIR)
      .map((name) => name.match(pattern))
      .filter(Boolean)
      .map((match) => Number(match[1]))
    : [];

  const next = Math.max(0, ...numbers) + 1;
  return `${year}_${season}_${String(next).padStart(3, '0')}.webp`;
}

function countMemoLines(value) {
  return value.split(/\r\n|\r|\n/).length;
}

async function writeAboutImage(sourcePath, targetPath) {
  await sharp(sourcePath, { failOn: 'none', unlimited: true })
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(targetPath);
}

app.get('/api/settings', async (_req, res) => {
  try {
    const settings = await readSettings();
    res.json({ ok: true, settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '設定ファイルを読み込めません。' });
  }
});

app.post('/api/about-image', upload.single('aboutImage'), async (req, res) => {
  let cleanupTemp = null;

  try {
    await ensureDirs();

    const season = String(req.body.season || '').trim();
    const memo = String(req.body.memo || '').trim();
    if (!SEASONS.has(season)) {
      return res.status(400).json({ ok: false, message: '季節を選択してください。' });
    }
    if (!memo) {
      return res.status(400).json({ ok: false, message: 'メモを入力してください。' });
    }
    if (memo.length > MAX_MEMO_LENGTH) {
      return res.status(400).json({ ok: false, message: 'メモは30文字以内で入力してください。' });
    }
    if (countMemoLines(memo) > MAX_MEMO_LINES) {
      return res.status(400).json({ ok: false, message: 'メモは3行以内で入力してください。' });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, message: '画像を選択してください。' });
    }

    cleanupTemp = async () => {
      try {
        await fsp.unlink(req.file.path);
      } catch {}
    };

    const year = new Date().getFullYear();
    const fileName = nextAboutImageName(year, season);
    const targetAbs = path.join(ABOUT_IMAGE_DIR, fileName);
    const aboutImage = `/images/site/about/${fileName}`;

    await writeAboutImage(req.file.path, targetAbs);

    const settings = {
      ...(await readSettings()),
      aboutImage,
      aboutImageSeason: season,
      aboutImageYear: year,
      aboutImageMemo: memo
    };

    await writeSettings(settings);
    await cleanupTemp();
    cleanupTemp = null;

    return res.json({
      ok: true,
      settings,
      file: {
        name: fileName,
        path: aboutImage
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'サーバエラーが発生しました。' });
  } finally {
    if (cleanupTemp) await cleanupTemp();
  }
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Site settings tool running at http://${HOST}:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the old site-settings server or run with PORT=3003.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
