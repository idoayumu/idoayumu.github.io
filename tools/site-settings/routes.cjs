const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const sharp = require('sharp');

const router = express.Router();

const ROOT = path.resolve(__dirname, '..', '..');
const SETTINGS_JSON_PATH = path.join(ROOT, 'src', 'data', 'site-settings.json');
const ABOUT_IMAGE_DIR = path.join(ROOT, 'public', 'images', 'site', 'about');
const HERO_IMAGE_DIR = path.join(ROOT, 'public', 'images', 'site', 'hero');
const TMP_DIR = path.join(__dirname, '.tmp');
const FALLBACK_ABOUT_IMAGE = '/images/site/about/2026_spring_001.webp';
const FALLBACK_ABOUT_IMAGE_MEMO = '水瀬あおい';
const FALLBACK_HERO_IMAGE = '/images/site/top-hero.webp';
const FALLBACK_HERO_IMAGE_MEMO = '管理ツール導入前';
const SEASONS = new Set(['spring', 'summer', 'autumn', 'winter', 'special']);
const MAX_MEMO_LENGTH = 30;
const MAX_MEMO_LINES = 3;

fs.mkdirSync(TMP_DIR, { recursive: true });

const upload = multer({ dest: TMP_DIR });

async function ensureDirs() {
  await fsp.mkdir(ABOUT_IMAGE_DIR, { recursive: true });
  await fsp.mkdir(HERO_IMAGE_DIR, { recursive: true });
  await fsp.mkdir(path.dirname(SETTINGS_JSON_PATH), { recursive: true });
  await fsp.mkdir(TMP_DIR, { recursive: true });
}

async function readSettings() {
  try {
    const raw = await fsp.readFile(SETTINGS_JSON_PATH, 'utf-8');
    const data = JSON.parse(raw);
    const aboutImage = data.aboutImage || FALLBACK_ABOUT_IMAGE;
    const aboutImageMemo = data.aboutImageMemo || (aboutImage === FALLBACK_ABOUT_IMAGE ? FALLBACK_ABOUT_IMAGE_MEMO : '');
    const heroImage = data.heroImage || FALLBACK_HERO_IMAGE;
    const heroImageMemo = data.heroImageMemo || (heroImage === FALLBACK_HERO_IMAGE ? FALLBACK_HERO_IMAGE_MEMO : '');
    return {
      aboutImage,
      aboutImageSeason: data.aboutImageSeason || '',
      aboutImageYear: data.aboutImageYear || null,
      aboutImageMemo,
      heroImage,
      heroImageSeason: data.heroImageSeason || 'spring',
      heroImageYear: data.heroImageYear || 2026,
      heroImageMemo
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        aboutImage: FALLBACK_ABOUT_IMAGE,
        aboutImageSeason: '',
        aboutImageYear: null,
        aboutImageMemo: FALLBACK_ABOUT_IMAGE_MEMO,
        heroImage: FALLBACK_HERO_IMAGE,
        heroImageSeason: 'spring',
        heroImageYear: 2026,
        heroImageMemo: FALLBACK_HERO_IMAGE_MEMO
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

function nextImageName(dir, year, season) {
  const pattern = new RegExp(`^${year}_${season}_(\\d{3})\\.webp$`);
  const numbers = fs.existsSync(dir)
    ? fs.readdirSync(dir)
      .map((name) => name.match(pattern))
      .filter(Boolean)
      .map((match) => Number(match[1]))
    : [];

  const next = Math.max(0, ...numbers) + 1;
  return `${year}_${season}_${String(next).padStart(3, '0')}.webp`;
}

function nextAboutImageName(year, season) {
  return nextImageName(ABOUT_IMAGE_DIR, year, season);
}

function nextHeroImageName(year, season) {
  return nextImageName(HERO_IMAGE_DIR, year, season);
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

router.get('/api/settings', async (_req, res) => {
  try {
    const settings = await readSettings();
    res.json({ ok: true, settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '設定ファイルを読み込めません。' });
  }
});

router.post('/api/about-image', upload.single('aboutImage'), async (req, res) => {
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

router.post('/api/hero-image', upload.single('heroImage'), async (req, res) => {
  let cleanupTemp = null;

  try {
    await ensureDirs();

    const season = String(req.body.season || '').trim();
    const memo = String(req.body.memo || '').trim();
    if (!SEASONS.has(season)) {
      return res.status(400).json({ ok: false, message: '季節を選択してください。' });
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
    const fileName = nextHeroImageName(year, season);
    const targetAbs = path.join(HERO_IMAGE_DIR, fileName);
    const heroImage = `/images/site/hero/${fileName}`;

    await writeAboutImage(req.file.path, targetAbs);

    const settings = {
      ...(await readSettings()),
      heroImage,
      heroImageSeason: season,
      heroImageYear: year,
      heroImageMemo: memo
    };

    await writeSettings(settings);
    await cleanupTemp();
    cleanupTemp = null;

    return res.json({
      ok: true,
      settings,
      file: {
        name: fileName,
        path: heroImage
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'サーバエラーが発生しました。' });
  } finally {
    if (cleanupTemp) await cleanupTemp();
  }
});

module.exports = router;
