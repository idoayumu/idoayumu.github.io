const express = require('express');
const path = require('path');
const fsp = require('fs/promises');
const workRoutes = require('../image-register/routes.cjs');
const modelRoutes = require('../model-register/routes.cjs');
const settingsRoutes = require('../site-settings/routes.cjs');

const app = express();
const PORT = Number(process.env.PORT || 3003);
const HOST = process.env.HOST || '127.0.0.1';

const ROOT = path.resolve(__dirname, '..', '..');
const WORKS_JSON_PATH = path.join(ROOT, 'src', 'data', 'works.json');
const MODELS_JSON_PATH = path.join(ROOT, 'src', 'data', 'models.json');
const SITE_SETTINGS_JSON_PATH = path.join(ROOT, 'src', 'data', 'site-settings.json');
const FALLBACK_HERO_IMAGE = '/images/site/top-hero.webp';
const FALLBACK_HERO_SEASON = 'spring';
const FALLBACK_HERO_YEAR = 2026;

app.use('/admin', express.static(path.join(__dirname, 'public')));
app.use('/admin/works', express.static(path.join(ROOT, 'tools', 'image-register', 'public')));
app.use('/admin/works', workRoutes);
app.use('/admin/models', express.static(path.join(ROOT, 'tools', 'model-register', 'public')));
app.use('/admin/models', modelRoutes);
app.use('/admin/settings', express.static(path.join(ROOT, 'tools', 'site-settings', 'public')));
app.use('/admin/settings', settingsRoutes);
app.use('/images', express.static(path.join(ROOT, 'public', 'images')));

async function readJsonArray(filePath) {
  try {
    const raw = await fsp.readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function readSiteSettings() {
  try {
    const raw = await fsp.readFile(SITE_SETTINGS_JSON_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

app.get('/', (_req, res) => {
  res.redirect('/admin/');
});

app.get('/admin/api/summary', async (_req, res) => {
  try {
    const [works, models, siteSettings] = await Promise.all([
      readJsonArray(WORKS_JSON_PATH),
      readJsonArray(MODELS_JSON_PATH),
      readSiteSettings()
    ]);

    res.json({
      ok: true,
      summary: {
        workCount: works.length,
        modelCount: models.length,
        aboutImage: siteSettings.aboutImage || '',
        aboutImageMemo: siteSettings.aboutImageMemo || '',
        heroImage: siteSettings.heroImage || FALLBACK_HERO_IMAGE,
        heroImageSeason: siteSettings.heroImageSeason || FALLBACK_HERO_SEASON,
        heroImageYear: siteSettings.heroImageYear || FALLBACK_HERO_YEAR
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: '管理情報を読み込めません。' });
  }
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Kokei Note admin tool running at http://${HOST}:${PORT}/admin/`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Run with PORT=3004 or stop the existing server.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
