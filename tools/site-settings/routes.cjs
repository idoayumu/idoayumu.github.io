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
    const aboutImageYear = data.aboutImageYear || (aboutImage === FALLBACK_ABOUT_IMAGE ? 2026 : null);
    const aboutImageSeason = data.aboutImageSeason || (aboutImage === FALLBACK_ABOUT_IMAGE ? 'spring' : '');
    const heroImageYear = data.heroImageYear || 2026;
    const heroImageSeason = data.heroImageSeason || 'spring';
    return {
      aboutImage,
      aboutImageSeason,
      aboutImageYear,
      aboutImageMemo,
      aboutImageHistory: normalizeHistory(data.aboutImageHistory, {
        path: aboutImage,
        year: aboutImageYear,
        season: aboutImageSeason,
        memo: aboutImageMemo,
        savedAt: '2026-06-10T00:00:00.000Z'
      }),
      heroImage,
      heroImageSeason,
      heroImageYear,
      heroImageMemo,
      heroImageHistory: normalizeHistory(data.heroImageHistory, {
        path: heroImage,
        year: heroImageYear,
        season: heroImageSeason,
        memo: heroImageMemo,
        savedAt: '2026-06-10T00:00:00.000Z'
      })
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        aboutImage: FALLBACK_ABOUT_IMAGE,
        aboutImageSeason: 'spring',
        aboutImageYear: 2026,
        aboutImageMemo: FALLBACK_ABOUT_IMAGE_MEMO,
        aboutImageHistory: [{
          path: FALLBACK_ABOUT_IMAGE,
          year: 2026,
          season: 'spring',
          memo: FALLBACK_ABOUT_IMAGE_MEMO,
          savedAt: '2026-06-10T00:00:00.000Z'
        }],
        heroImage: FALLBACK_HERO_IMAGE,
        heroImageSeason: 'spring',
        heroImageYear: 2026,
        heroImageMemo: FALLBACK_HERO_IMAGE_MEMO,
        heroImageHistory: [{
          path: FALLBACK_HERO_IMAGE,
          year: 2026,
          season: 'spring',
          memo: FALLBACK_HERO_IMAGE_MEMO,
          savedAt: '2026-06-10T00:00:00.000Z'
        }]
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

function normalizeHistory(history, fallbackItem) {
  const items = Array.isArray(history) ? history : [];
  const normalized = items
    .filter((item) => item && typeof item.path === 'string' && item.path.trim())
    .map((item) => ({
      path: item.path,
      year: Number(item.year) || null,
      season: typeof item.season === 'string' ? item.season : '',
      memo: typeof item.memo === 'string' ? item.memo : '',
      savedAt: typeof item.savedAt === 'string' ? item.savedAt : ''
    }));

  if (fallbackItem.path && !normalized.some((item) => item.path === fallbackItem.path)) {
    normalized.unshift(fallbackItem);
  }

  return normalized;
}

function addHistoryItem(history, item) {
  const withoutSamePath = history.filter((entry) => entry.path !== item.path);
  return [item, ...withoutSamePath];
}

function withCurrentFlags(history, currentPath) {
  return history
    .map((item) => ({
      ...item,
      isCurrent: item.path === currentPath
    }))
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return String(b.savedAt).localeCompare(String(a.savedAt));
    });
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

router.get('/api/image-history', async (_req, res) => {
  try {
    const settings = await readSettings();
    res.json({
      ok: true,
      history: {
        about: withCurrentFlags(settings.aboutImageHistory, settings.aboutImage),
        hero: withCurrentFlags(settings.heroImageHistory, settings.heroImage)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '画像履歴を読み込めません。' });
  }
});

router.post('/api/use-image', express.json(), async (req, res) => {
  try {
    const type = String(req.body.type || '').trim();
    const imagePath = String(req.body.path || '').trim();
    if (!['about', 'hero'].includes(type)) {
      return res.status(400).json({ ok: false, message: '画像種別が不正です。' });
    }
    if (!imagePath.startsWith('/images/')) {
      return res.status(400).json({ ok: false, message: '画像パスが不正です。' });
    }

    const settings = await readSettings();
    const historyKey = type === 'about' ? 'aboutImageHistory' : 'heroImageHistory';
    const selected = settings[historyKey].find((item) => item.path === imagePath);
    if (!selected) {
      return res.status(404).json({ ok: false, message: '履歴内に画像が見つかりません。' });
    }

    const nextSettings = { ...settings };
    if (type === 'about') {
      nextSettings.aboutImage = selected.path;
      nextSettings.aboutImageYear = selected.year;
      nextSettings.aboutImageSeason = selected.season;
      nextSettings.aboutImageMemo = selected.memo;
    } else {
      nextSettings.heroImage = selected.path;
      nextSettings.heroImageYear = selected.year;
      nextSettings.heroImageSeason = selected.season;
      nextSettings.heroImageMemo = selected.memo;
    }

    await writeSettings(nextSettings);
    res.json({ ok: true, settings: nextSettings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '画像の使用設定を更新できません。' });
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
    const savedAt = new Date().toISOString();

    await writeAboutImage(req.file.path, targetAbs);

    const currentSettings = await readSettings();
    const settings = {
      ...currentSettings,
      aboutImage,
      aboutImageSeason: season,
      aboutImageYear: year,
      aboutImageMemo: memo,
      aboutImageHistory: addHistoryItem(currentSettings.aboutImageHistory, {
        path: aboutImage,
        year,
        season,
        memo,
        savedAt
      })
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
    const savedAt = new Date().toISOString();

    await writeAboutImage(req.file.path, targetAbs);

    const currentSettings = await readSettings();
    const settings = {
      ...currentSettings,
      heroImage,
      heroImageSeason: season,
      heroImageYear: year,
      heroImageMemo: memo,
      heroImageHistory: addHistoryItem(currentSettings.heroImageHistory, {
        path: heroImage,
        year,
        season,
        memo,
        savedAt
      })
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
