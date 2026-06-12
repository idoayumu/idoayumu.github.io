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
const worksPostTestButton = document.getElementById('worksPostTestButton');
const worksEditTestButton = document.getElementById('worksEditTestButton');
const worksDeleteTestButton = document.getElementById('worksDeleteTestButton');
const worksPostTestResult = document.getElementById('worksPostTestResult');
const testEditWorkId = '260328minaseaoi_0002';
const testDeleteWorkId = '260612cloudflaretest_1099';

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

function buildWorksPostTestPayload() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const sequence = String((now.getHours() * 60 + now.getMinutes()) % 10000).padStart(4, '0');
  const id = `${yy}${mm}${dd}cloudflaretest_${sequence}`;

  return {
    id,
    title: 'Cloudflare保存テスト',
    date: `${now.getFullYear()}-${mm}-${dd}`,
    location: 'テスト',
    production: 'Cloudflare API Test',
    caption: 'Cloudflare Pages Functionsからworks.jsonへPOSTするテストです。',
    modelIds: ['minaseaoi'],
    image: '/images/works/large/260328minaseaoi_0001.webp',
    thumbnail: '/images/works/thumbs/260328minaseaoi_0001.webp'
  };
}

function renderWorksPostTestResult(value) {
  if (!worksPostTestResult) return;
  worksPostTestResult.hidden = false;
  worksPostTestResult.textContent = typeof value === 'string'
    ? value
    : JSON.stringify(value, null, 2);
}

async function postWorksTest() {
  if (!worksPostTestButton) return;
  const payload = buildWorksPostTestPayload();
  const ok = window.confirm(`テスト作品 ${payload.id} をGitHubへcommitします。実行しますか？`);
  if (!ok) return;

  worksPostTestButton.disabled = true;
  renderWorksPostTestResult('POST中です...');

  try {
    const resp = await fetch('/api/admin/works', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const text = await resp.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (resp.ok && json.commitUrl) {
      renderWorksPostTestResult({
        success: true,
        commitUrl: json.commitUrl,
        updatedFile: json.updatedFile,
        workId: json.workId
      });
      return;
    }

    renderWorksPostTestResult(json);
  } catch (err) {
    renderWorksPostTestResult({
      success: false,
      error: {
        message: err.message
      }
    });
  } finally {
    worksPostTestButton.disabled = false;
  }
}

async function deleteWorksTest() {
  if (!worksDeleteTestButton) return;
  const ok = window.confirm(`テスト作品 ${testDeleteWorkId} をworks.jsonから削除してGitHubへcommitします。実行しますか？`);
  if (!ok) return;

  worksDeleteTestButton.disabled = true;
  renderWorksPostTestResult('DELETE中です...');

  try {
    const resp = await fetch('/api/admin/works', {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ id: testDeleteWorkId })
    });
    const text = await resp.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (resp.ok && json.commitUrl) {
      renderWorksPostTestResult({
        success: true,
        commitUrl: json.commitUrl,
        updatedFile: json.updatedFile,
        deletedWorkId: json.deletedWorkId
      });
      return;
    }

    renderWorksPostTestResult(json);
  } catch (err) {
    renderWorksPostTestResult({
      success: false,
      error: {
        message: err.message
      }
    });
  } finally {
    worksDeleteTestButton.disabled = false;
  }
}

async function editWorksTest() {
  if (!worksEditTestButton) return;
  const ok = window.confirm(`作品 ${testEditWorkId} のtitle末尾に【編集テスト】を付けてGitHubへcommitします。実行しますか？`);
  if (!ok) return;

  worksEditTestButton.disabled = true;
  renderWorksPostTestResult('PUT中です...');

  try {
    const works = await fetchJson('/data/works.json');
    const current = Array.isArray(works)
      ? works.find((work) => work?.id === testEditWorkId)
      : null;

    if (!current) {
      renderWorksPostTestResult({
        success: false,
        error: {
          code: 'work_not_found_in_static_json',
          message: `/data/works.jsonで作品が見つかりません: ${testEditWorkId}`
        }
      });
      return;
    }

    const title = String(current.title || '').endsWith('【編集テスト】')
      ? current.title
      : `${current.title || ''}【編集テスト】`;

    const resp = await fetch('/api/admin/works', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        id: testEditWorkId,
        work: {
          title,
          date: current.date,
          location: current.location,
          production: current.production,
          caption: current.caption,
          modelIds: current.modelIds,
          image: current.image,
          thumbnail: current.thumbnail
        }
      })
    });
    const text = await resp.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (resp.ok && json.commitUrl) {
      renderWorksPostTestResult({
        success: true,
        commitUrl: json.commitUrl,
        updatedFile: json.updatedFile,
        updatedWorkId: json.updatedWorkId
      });
      return;
    }

    renderWorksPostTestResult(json);
  } catch (err) {
    renderWorksPostTestResult({
      success: false,
      error: {
        message: err.message
      }
    });
  } finally {
    worksEditTestButton.disabled = false;
  }
}

if (isSummaryPage) {
  loadSummary();
}

worksPostTestButton?.addEventListener('click', postWorksTest);
worksEditTestButton?.addEventListener('click', editWorksTest);
worksDeleteTestButton?.addEventListener('click', deleteWorksTest);
