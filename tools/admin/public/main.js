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
const worksEditResetButton = document.getElementById('worksEditResetButton');
const worksDeleteTestButton = document.getElementById('worksDeleteTestButton');
const worksPostTestResult = document.getElementById('worksPostTestResult');
const modelsPostTestButton = document.getElementById('modelsPostTestButton');
const modelsEditTestButton = document.getElementById('modelsEditTestButton');
const modelsDeleteTestButton = document.getElementById('modelsDeleteTestButton');
const modelsTestResult = document.getElementById('modelsTestResult');
const settingsGetTestButton = document.getElementById('settingsGetTestButton');
const settingsPutTestButton = document.getElementById('settingsPutTestButton');
const settingsTestResult = document.getElementById('settingsTestResult');
const pendingPanel = document.getElementById('pendingPanel');
const pendingSummary = document.getElementById('pendingSummary');
const pendingList = document.getElementById('pendingList');
const pendingResult = document.getElementById('pendingResult');
const testEditWorkId = '260328minaseaoi_0002';
const testEditOriginalTitle = 'ひだまりの笑顔';
const testDeleteWorkId = '260612cloudflaretest_1099';
const testModelId = 'cloudflare-test-model';
const pendingItemsByKey = new Map();

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

async function readResponseJson(resp) {
  const text = await resp.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {
      success: false,
      error: {
        code: 'invalid_response',
        message: 'APIレスポンスをJSONとして解析できませんでした。',
        status: resp.status,
        contentType: resp.headers.get('content-type') || '',
        bodyPreview: text.slice(0, 500)
      }
    };
  }
}

function renderPendingResult(value) {
  if (!pendingResult) return;
  pendingResult.hidden = false;
  pendingResult.textContent = typeof value === 'string'
    ? value
    : JSON.stringify(value, null, 2);
}

function pendingTypeLabel(type) {
  if (type === 'works') return '作品';
  if (type === 'models') return 'モデル';
  return '設定';
}

function pendingDisplayTitle(item) {
  return item.title || item.id || 'ID未取得';
}

function renderPendingStatus(payload) {
  if (!pendingPanel || !pendingSummary || !pendingList) return;
  pendingPanel.hidden = false;
  pendingItemsByKey.clear();
  pendingList.innerHTML = '';

  const works = Array.isArray(payload.pending?.works) ? payload.pending.works : [];
  const models = Array.isArray(payload.pending?.models) ? payload.pending.models : [];
  const settings = Array.isArray(payload.pending?.settings) ? payload.pending.settings : [];
  const items = [...works, ...models, ...settings];

  if (!items.length) {
    pendingSummary.textContent = 'pendingはありません。保存途中または反映待ちの登録予約は残っていません。';
    return;
  }

  pendingSummary.textContent = `${items.length}件のpendingがあります。pendingは保存処理途中、または反映前の一時状態です。勝手には削除しません。`;

  for (const item of items) {
    const key = `${item.type}:${item.id}`;
    pendingItemsByKey.set(key, item);
    const card = document.createElement('article');
    card.className = `pending-card ${item.status === 'needs_attention' ? 'is-warning' : 'is-waiting'}`;
    card.innerHTML = `
      <div class="pending-card-main">
        <span class="pending-badge">${escapeHtml(item.statusLabel || '反映待ち')}</span>
        <h3>${escapeHtml(pendingTypeLabel(item.type))}: ${escapeHtml(pendingDisplayTitle(item))}</h3>
        <dl>
          <div><dt>ID</dt><dd>${escapeHtml(item.id)}</dd></div>
          <div><dt>状態</dt><dd>${escapeHtml(item.statusLabel || '反映待ち')}</dd></div>
          <div><dt>元画像</dt><dd>${escapeHtml(item.hasOriginal ? item.originalFile : '見つかりません')}</dd></div>
          <div><dt>JSON</dt><dd>${escapeHtml(item.jsonValid ? '構文OK' : `構文エラー: ${item.jsonError || '不明'}`)}</dd></div>
        </dl>
        <p class="pending-help">${item.status === 'needs_attention'
          ? '失敗の可能性があります。内容確認後、再試行するか、不要ならpendingだけを破棄してください。'
          : 'GitHub Actionsによる反映待ちです。しばらく待っても残る場合は再試行できます。'}</p>
      </div>
      <div class="pending-actions">
        <button type="button" data-pending-action="details" data-pending-key="${escapeHtml(key)}">pending内容を確認</button>
        <button type="button" data-pending-action="retry" data-pending-key="${escapeHtml(key)}" ${item.jsonValid && item.canRetry !== false ? '' : 'disabled'}>再試行</button>
        <button class="danger-button" type="button" data-pending-action="discard" data-pending-key="${escapeHtml(key)}">pendingを破棄</button>
      </div>
    `;
    pendingList.append(card);
  }
}

function renderPendingLoadError(error) {
  if (!pendingPanel || !pendingSummary || !pendingList) return;
  pendingPanel.hidden = false;
  pendingSummary.textContent = 'pending状態を取得できませんでした。Cloudflare Access認証またはGitHub接続を確認してください。';
  pendingList.innerHTML = '';
  renderPendingResult(error);
}

async function loadPendingStatus() {
  if (!isSummaryPage || !pendingPanel) return;

  try {
    const resp = await fetch('/api/admin/pending', { cache: 'no-store' });
    const json = await readResponseJson(resp);
    if (!resp.ok || json.success === false) {
      renderPendingLoadError(json);
      return;
    }
    renderPendingStatus(json);
  } catch (err) {
    renderPendingLoadError({
      success: false,
      error: {
        message: err.message
      }
    });
  }
}

async function requestPendingAction(method, item) {
  const resp = await fetch('/api/admin/pending', {
    method,
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      type: item.type,
      id: item.id
    })
  });
  const json = await readResponseJson(resp);
  return { ok: resp.ok && json.success !== false, json };
}

async function handlePendingAction(event) {
  const button = event.target.closest('[data-pending-action]');
  if (!button) return;

  const item = pendingItemsByKey.get(button.dataset.pendingKey);
  if (!item) return;

  const action = button.dataset.pendingAction;
  if (action === 'details') {
    renderPendingResult({
      note: 'pending内容です。保存済みとは異なり、まだ本体JSONへ反映されていない一時状態です。',
      item
    });
    pendingResult?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  if (action === 'retry') {
    const ok = window.confirm(`${pendingTypeLabel(item.type)} ${item.id} のpendingを再試行します。GitHub Actionsを再実行するためのcommitがdevへ作成されます。`);
    if (!ok) return;
    button.disabled = true;
    renderPendingResult('pending再試行を要求中です...');
    const result = await requestPendingAction('POST', item);
    renderPendingResult(result.json);
    await loadPendingStatus();
    return;
  }

  if (action === 'discard') {
    const ok = window.confirm(`${pendingTypeLabel(item.type)} ${item.id} のpendingだけを破棄します。\n\n消えるもの:\n- pending内の元画像\n- pending内のJSON\n\n消えないもの:\n- src/data/works.json\n- src/data/models.json\n- site-settings.json\n\n退避コピーを残してから破棄します。実行しますか？`);
    if (!ok) return;
    button.disabled = true;
    renderPendingResult('pendingを破棄中です...');
    const result = await requestPendingAction('DELETE', item);
    renderPendingResult(result.json);
    await loadPendingStatus();
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
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
      await loadPendingStatus();
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
      await loadPendingStatus();
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

function renderModelsTestResult(value) {
  if (!modelsTestResult) return;
  modelsTestResult.hidden = false;
  modelsTestResult.textContent = typeof value === 'string'
    ? value
    : JSON.stringify(value, null, 2);
}

function renderSettingsTestResult(value) {
  if (!settingsTestResult) return;
  settingsTestResult.hidden = false;
  settingsTestResult.textContent = typeof value === 'string'
    ? value
    : JSON.stringify(value, null, 2);
}

function buildModelTestPayload(overrides = {}) {
  return {
    id: testModelId,
    name: 'Cloudflareテストモデル',
    displayName: 'Cloudflareテストモデル',
    nameKana: 'クラウドフレアテストモデル',
    nameEn: 'Cloudflare Test Model',
    aliases: [],
    agency: 'Cloudflare API Test',
    bio: 'Models APIのテスト用モデルです。',
    thumbnail: 'minaseaoi_thumb.jpg',
    links: {
      instagram: '',
      x: '',
      threads: '',
      website: '',
      websiteLabel: ''
    },
    featured: false,
    profileImagePosition: 'center',
    ...overrides
  };
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

async function resetEditWorksTest() {
  if (!worksEditResetButton) return;
  const ok = window.confirm(`作品 ${testEditWorkId} のtitleを「${testEditOriginalTitle}」へ戻してGitHubへcommitします。実行しますか？`);
  if (!ok) return;

  worksEditResetButton.disabled = true;
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

    const resp = await fetch('/api/admin/works', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        id: testEditWorkId,
        work: {
          title: testEditOriginalTitle,
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
        updatedWorkId: json.updatedWorkId,
        title: testEditOriginalTitle
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
    worksEditResetButton.disabled = false;
  }
}

async function requestModelTest(method, payload) {
  const resp = await fetch('/api/admin/models', {
    method,
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const text = await resp.text();
  try {
    return { ok: resp.ok, json: text ? JSON.parse(text) : {} };
  } catch {
    return { ok: resp.ok, json: { raw: text } };
  }
}

async function postModelTest() {
  if (!modelsPostTestButton) return;
  const ok = window.confirm(`テストモデル ${testModelId} をmodels.jsonへ追加してGitHubへcommitします。実行しますか？`);
  if (!ok) return;

  modelsPostTestButton.disabled = true;
  renderModelsTestResult('POST中です...');

  try {
    const { ok: succeeded, json } = await requestModelTest('POST', buildModelTestPayload());
    if (succeeded && json.commitUrl) {
      renderModelsTestResult({
        success: true,
        commitUrl: json.commitUrl,
        updatedFile: json.updatedFile,
        modelId: json.modelId
      });
      return;
    }
    renderModelsTestResult(json);
  } catch (err) {
    renderModelsTestResult({
      success: false,
      error: { message: err.message }
    });
  } finally {
    modelsPostTestButton.disabled = false;
  }
}

async function editModelTest() {
  if (!modelsEditTestButton) return;
  const ok = window.confirm(`テストモデル ${testModelId} のdisplayName末尾に【編集テスト】を付けてGitHubへcommitします。実行しますか？`);
  if (!ok) return;

  modelsEditTestButton.disabled = true;
  renderModelsTestResult('PUT中です...');

  try {
    const { ok: succeeded, json } = await requestModelTest('PUT', {
      id: testModelId,
      model: buildModelTestPayload({
        name: 'Cloudflareテストモデル【編集テスト1】',
        displayName: 'Cloudflareテストモデル【編集テスト2】'
      })
    });

    if (succeeded && json.commitUrl) {
      renderModelsTestResult({
        success: true,
        commitUrl: json.commitUrl,
        updatedFile: json.updatedFile,
        updatedModelId: json.updatedModelId
      });
      return;
    }
    renderModelsTestResult(json);
  } catch (err) {
    renderModelsTestResult({
      success: false,
      error: { message: err.message }
    });
  } finally {
    modelsEditTestButton.disabled = false;
  }
}

async function deleteModelTest() {
  if (!modelsDeleteTestButton) return;
  const ok = window.confirm(`テストモデル ${testModelId} をmodels.jsonから削除してGitHubへcommitします。実行しますか？`);
  if (!ok) return;

  modelsDeleteTestButton.disabled = true;
  renderModelsTestResult('DELETE中です...');

  try {
    const { ok: succeeded, json } = await requestModelTest('DELETE', { id: testModelId });
    if (succeeded && json.commitUrl) {
      renderModelsTestResult({
        success: true,
        commitUrl: json.commitUrl,
        updatedFile: json.updatedFile,
        deletedModelId: json.deletedModelId
      });
      return;
    }
    renderModelsTestResult(json);
  } catch (err) {
    renderModelsTestResult({
      success: false,
      error: { message: err.message }
    });
  } finally {
    modelsDeleteTestButton.disabled = false;
  }
}

async function requestSettingsTest(method, payload) {
  const resp = await fetch('/api/admin/settings', {
    method,
    headers: payload ? { 'content-type': 'application/json' } : {},
    body: payload ? JSON.stringify(payload) : undefined
  });
  const text = await resp.text();
  try {
    return { ok: resp.ok, json: text ? JSON.parse(text) : {} };
  } catch {
    return { ok: resp.ok, json: { raw: text } };
  }
}

async function getSettingsTest() {
  if (!settingsGetTestButton) return;

  settingsGetTestButton.disabled = true;
  renderSettingsTestResult('GET中です...');

  try {
    const { json } = await requestSettingsTest('GET');
    renderSettingsTestResult(json);
  } catch (err) {
    renderSettingsTestResult({
      success: false,
      error: { message: err.message }
    });
  } finally {
    settingsGetTestButton.disabled = false;
  }
}

async function putSettingsTest() {
  if (!settingsPutTestButton) return;
  const ok = window.confirm('site-settings.jsonのadminTestMemoだけを更新してGitHubへcommitします。実行しますか？');
  if (!ok) return;

  settingsPutTestButton.disabled = true;
  renderSettingsTestResult('GET中です...');

  try {
    const latest = await requestSettingsTest('GET');
    if (!latest.ok || !latest.json?.settings) {
      renderSettingsTestResult(latest.json);
      return;
    }

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const adminTestMemo = `Cloudflare Settings API Test ${yyyy}-${mm}-${dd} ${hh}:${min}`;

    renderSettingsTestResult('PUT中です...');
    const { ok: succeeded, json } = await requestSettingsTest('PUT', {
      settings: {
        adminTestMemo
      }
    });

    if (succeeded && json.commitUrl) {
      renderSettingsTestResult({
        success: true,
        commitUrl: json.commitUrl,
        updatedFile: json.updatedFile,
        adminTestMemo
      });
      return;
    }

    renderSettingsTestResult(json);
  } catch (err) {
    renderSettingsTestResult({
      success: false,
      error: { message: err.message }
    });
  } finally {
    settingsPutTestButton.disabled = false;
  }
}

if (isSummaryPage) {
  loadSummary();
}

worksPostTestButton?.addEventListener('click', postWorksTest);
worksEditTestButton?.addEventListener('click', editWorksTest);
worksEditResetButton?.addEventListener('click', resetEditWorksTest);
worksDeleteTestButton?.addEventListener('click', deleteWorksTest);
modelsPostTestButton?.addEventListener('click', postModelTest);
modelsEditTestButton?.addEventListener('click', editModelTest);
modelsDeleteTestButton?.addEventListener('click', deleteModelTest);
settingsGetTestButton?.addEventListener('click', getSettingsTest);
settingsPutTestButton?.addEventListener('click', putSettingsTest);
pendingList?.addEventListener('click', handlePendingAction);
