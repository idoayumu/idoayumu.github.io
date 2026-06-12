const isSummaryPage = Boolean(document.getElementById('workCount'));
const workCount = document.getElementById('workCount');
const modelCount = document.getElementById('modelCount');
const aboutImage = document.getElementById('aboutImage');
const aboutImageThumb = document.getElementById('aboutImageThumb');
const aboutImageMemo = document.getElementById('aboutImageMemo');
const heroImage = document.getElementById('heroImage');
const heroImageMemo = document.getElementById('heroImageMemo');
const heroImageMeta = document.getElementById('heroImageMeta');
const heroImageThumb = document.getElementById('heroImageThumb');
const summaryMessage = document.getElementById('summaryMessage');
const fallbackHeroImage = '/images/site/top-hero.webp';
const fallbackHeroSeason = 'spring';
const fallbackHeroYear = 2026;
const fallbackHeroMemo = '管理ツール導入前';
const staticModeMessage = 'Cloudflare静的表示モードです。保存・編集はできません。ローカル管理ツールを使用してください。';
const authStatus = document.getElementById('authStatus');
const authStatusTitle = document.getElementById('authStatusTitle');
const authStatusDetail = document.getElementById('authStatusDetail');

function fileNameFromPath(value) {
  const text = String(value || '').trim();
  if (!text) return '未設定';
  return text.split('/').filter(Boolean).at(-1) || text;
}

async function fetchJson(path) {
  const resp = await fetch(path, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`${path}: HTTP ${resp.status}`);
  return resp.json();
}

function setImageOrPlaceholder(img, src) {
  if (!src) {
    img.removeAttribute('src');
    img.hidden = true;
    return;
  }

  img.hidden = false;
  img.onerror = () => {
    img.hidden = true;
  };
  img.src = src;
}

function renderSummary(summary, mode) {
  const currentAboutImage = summary.aboutImage || '';
  const currentHeroImage = summary.heroImage || fallbackHeroImage;
  const currentHeroSeason = summary.heroImageSeason || fallbackHeroSeason;
  const currentHeroYear = summary.heroImageYear || fallbackHeroYear;
  const currentHeroMemo = summary.heroImageMemo || (currentHeroImage === fallbackHeroImage ? fallbackHeroMemo : '未設定');

  workCount.textContent = Number.isFinite(summary.workCount) ? `${summary.workCount} 件` : '未取得';
  modelCount.textContent = Number.isFinite(summary.modelCount) ? `${summary.modelCount} 人` : '未取得';
  aboutImage.textContent = fileNameFromPath(currentAboutImage);
  setImageOrPlaceholder(aboutImageThumb, currentAboutImage);
  aboutImageMemo.textContent = summary.aboutImageMemo || '未設定';
  heroImageMemo.textContent = currentHeroMemo;
  heroImage.textContent = currentHeroImage || '未設定';
  heroImageMeta.textContent = `${currentHeroSeason} / ${currentHeroYear}`;
  setImageOrPlaceholder(heroImageThumb, currentHeroImage);
  summaryMessage.textContent = mode === 'static'
    ? staticModeMessage
    : '';
}

async function loadLocalSummary() {
  const json = await fetchJson('./api/summary');
  if (!json.ok) throw new Error(json.message || 'summary api failed');
  return json.summary;
}

async function loadStaticSummary() {
  const results = await Promise.allSettled([
    fetchJson('./data/works.json'),
    fetchJson('./data/models.json'),
    fetchJson('./data/site-settings.json')
  ]);

  const works = results[0].status === 'fulfilled' && Array.isArray(results[0].value)
    ? results[0].value
    : null;
  const models = results[1].status === 'fulfilled' && Array.isArray(results[1].value)
    ? results[1].value
    : null;
  const settings = results[2].status === 'fulfilled' && results[2].value
    ? results[2].value
    : {};

  return {
    workCount: Array.isArray(works) ? works.length : NaN,
    modelCount: Array.isArray(models) ? models.length : NaN,
    aboutImage: settings.aboutImage || '',
    aboutImageMemo: settings.aboutImageMemo || '',
    heroImage: settings.heroImage || fallbackHeroImage,
    heroImageSeason: settings.heroImageSeason || fallbackHeroSeason,
    heroImageYear: settings.heroImageYear || fallbackHeroYear,
    heroImageMemo: settings.heroImageMemo || fallbackHeroMemo
  };
}

function activateStaticMode() {
  document.body.classList.add('is-static-mode');
  document.querySelector('.admin-nav-title')?.setAttribute('href', './');
  document.querySelectorAll('.tool-card, .admin-nav-links a').forEach((link) => {
    const href = link.getAttribute('href') || '';
    const canBrowseStatic = href === '/admin/works/' || href === '/admin/models/';
    if (canBrowseStatic) {
      link.classList.add('is-static-readable');
      return;
    }

    link.setAttribute('aria-disabled', 'true');
    link.addEventListener('click', (event) => {
      event.preventDefault();
      summaryMessage.textContent = 'Cloudflare公開版では保存できません。ローカル管理ツールを使用してください。';
      summaryMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
}

function renderAuthStatus(kind, title, detail) {
  if (!authStatus || !authStatusTitle || !authStatusDetail) return;
  authStatus.hidden = false;
  authStatus.classList.remove('is-ok', 'is-warn', 'is-error');
  authStatus.classList.add(`is-${kind}`);
  authStatusTitle.textContent = title;
  authStatusDetail.textContent = detail;
}

async function loadCloudflareSession() {
  if (!isSummaryPage) return;

  try {
    const resp = await fetchJson('/api/admin/session');
    if (resp.authenticated && resp.canSave) {
      renderAuthStatus('ok', 'Cloudflare Access認証済み：保存準備OK', '保存機能は次フェーズです');
      return;
    }

    if (resp.authenticated) {
      renderAuthStatus('warn', 'Cloudflare Access認証済み：保存権限なし', '許可メールの設定を確認してください。');
      return;
    }

    renderAuthStatus('warn', 'Cloudflare Access認証を確認できません', '保存機能は次フェーズです');
  } catch (err) {
    console.info('Cloudflare Access session API is unavailable.', err);
    renderAuthStatus('warn', 'Cloudflare Access認証を確認できません', '保存機能は次フェーズです');
  }
}

async function loadSummary() {
  try {
    const summary = await loadLocalSummary();
    renderSummary(summary, 'local');
  } catch (err) {
    console.info('Local admin API is unavailable. Falling back to static mode.', err);
    activateStaticMode();
    try {
      const summary = await loadStaticSummary();
      renderSummary(summary, 'static');
      await loadCloudflareSession();
    } catch (staticErr) {
      console.error(staticErr);
      renderSummary({
        workCount: NaN,
        modelCount: NaN,
        aboutImage: '',
        aboutImageMemo: '未取得',
        heroImage: '',
        heroImageMemo: '未取得',
        heroImageSeason: '未取得',
        heroImageYear: '未取得'
      }, 'static');
      await loadCloudflareSession();
    }
  }
}

if (isSummaryPage) {
  loadSummary();
}
