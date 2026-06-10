const form = document.getElementById('aboutImageForm');
const imageInput = document.getElementById('aboutImage');
const currentPreview = document.getElementById('currentPreview');
const currentInfo = document.getElementById('currentInfo');
const newPreview = document.getElementById('newPreview');
const memoInput = document.getElementById('aboutImageMemo');
const heroForm = document.getElementById('heroImageForm');
const heroImageInput = document.getElementById('heroImage');
const currentHeroPreview = document.getElementById('currentHeroPreview');
const currentHeroInfo = document.getElementById('currentHeroInfo');
const newHeroPreview = document.getElementById('newHeroPreview');
const heroHistory = document.getElementById('heroHistory');
const aboutHistory = document.getElementById('aboutHistory');
const result = document.getElementById('result');
const maxMemoLength = 30;
const maxMemoLines = 3;
const fallbackHeroImage = '/images/site/top-hero.webp';
const fallbackHeroSeason = 'spring';
const fallbackHeroYear = 2026;
const fallbackHeroMemo = '管理ツール導入前';

function countMemoLines(value) {
  return value.split(/\r\n|\r|\n/).length;
}

function renderCurrent(settings) {
  currentPreview.src = settings.aboutImage;
  currentInfo.innerHTML = '';

  [
    ['画像', settings.aboutImage || '未設定'],
    ['季節', settings.aboutImageSeason || '未設定'],
    ['メモ', settings.aboutImageMemo || '未設定']
  ].forEach(([label, value]) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    row.append(dt, dd);
    currentInfo.appendChild(row);
  });

  const heroImage = settings.heroImage || fallbackHeroImage;
  const heroImageSeason = settings.heroImageSeason || fallbackHeroSeason;
  const heroImageYear = settings.heroImageYear || fallbackHeroYear;
  const heroImageMemo = settings.heroImageMemo || fallbackHeroMemo;

  currentHeroPreview.src = heroImage;
  currentHeroInfo.innerHTML = '';

  [
    ['画像', heroImage],
    ['季節', heroImageSeason],
    ['年', heroImageYear],
    ['メモ', heroImageMemo]
  ].forEach(([label, value]) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    row.append(dt, dd);
    currentHeroInfo.appendChild(row);
  });
}

function fileNameFromPath(imagePath) {
  return imagePath.split('/').filter(Boolean).pop() || imagePath;
}

function formatSavedAt(value) {
  if (!value) return '未設定';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function createMetaRow(label, value) {
  const row = document.createElement('div');
  const dt = document.createElement('dt');
  const dd = document.createElement('dd');
  dt.textContent = label;
  dd.textContent = value || '未設定';
  row.append(dt, dd);
  return row;
}

function renderHistoryList(container, items, type) {
  container.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = '履歴はまだありません。';
    container.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const card = document.createElement('article');
    card.className = `history-card${item.isCurrent ? ' is-current' : ''}`;

    const media = document.createElement('div');
    media.className = type === 'hero' ? 'history-thumb history-thumb-hero' : 'history-thumb';
    const img = document.createElement('img');
    img.src = item.path;
    img.alt = fileNameFromPath(item.path);
    media.appendChild(img);

    const body = document.createElement('div');
    body.className = 'history-card-body';

    const titleRow = document.createElement('div');
    titleRow.className = 'history-card-title-row';

    const title = document.createElement('h4');
    title.textContent = fileNameFromPath(item.path);
    titleRow.appendChild(title);

    if (item.isCurrent) {
      const badge = document.createElement('span');
      badge.className = 'current-badge';
      badge.textContent = '現在使用中';
      titleRow.appendChild(badge);
    }

    const meta = document.createElement('dl');
    meta.className = 'history-meta';
    meta.append(
      createMetaRow('year', item.year),
      createMetaRow('season', item.season),
      createMetaRow('memo', item.memo),
      createMetaRow('savedAt', formatSavedAt(item.savedAt))
    );

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-use-button';
    button.textContent = item.isCurrent ? '使用中' : 'この画像を使用する';
    button.disabled = item.isCurrent;
    button.addEventListener('click', () => useHistoryImage(type, item.path));

    body.append(titleRow, meta, button);
    card.append(media, body);
    container.appendChild(card);
  });
}

async function loadImageHistory() {
  const resp = await fetch('api/image-history');
  const json = await resp.json();
  if (!resp.ok || !json.ok) throw new Error(json.message || resp.statusText);

  renderHistoryList(heroHistory, json.history.hero || [], 'hero');
  renderHistoryList(aboutHistory, json.history.about || [], 'about');
}

async function loadSettings() {
  try {
    const resp = await fetch('api/settings');
    const json = await resp.json();
    if (!resp.ok || !json.ok) throw new Error(json.message || resp.statusText);
    renderCurrent(json.settings);
    await loadImageHistory();
  } catch (err) {
    console.error(err);
    result.innerHTML = '<span class="error">設定を読み込めません。</span>';
  }
}

async function readApiResponse(resp) {
  const contentType = resp.headers.get('content-type') || '';
  const text = await resp.text();

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`HTTP ${resp.status}: JSONの解析に失敗しました。${text.slice(0, 200)}`);
    }
  }

  return {
    ok: false,
    message: text.trim() || resp.statusText || 'サーバーから空の応答が返りました。'
  };
}

async function useHistoryImage(type, imagePath) {
  result.textContent = '切り替え中...';

  try {
    const resp = await fetch('api/use-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type, path: imagePath })
    });
    const json = await readApiResponse(resp);

    if (!resp.ok || !json.ok) {
      result.innerHTML = `<span class="error">失敗: HTTP ${resp.status} ${json.message || resp.statusText}</span>`;
      return;
    }

    renderCurrent(json.settings);
    await loadImageHistory();
    result.innerHTML = '<div class="success">使用中の画像を切り替えました</div>';
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    result.innerHTML = `<span class="error">通信エラー: ${message}</span>`;
  }
}

imageInput.addEventListener('change', () => {
  newPreview.innerHTML = '';
  newPreview.classList.add('empty');
  const file = imageInput.files && imageInput.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  img.onload = () => URL.revokeObjectURL(url);
  newPreview.classList.remove('empty');
  newPreview.appendChild(img);
});

heroImageInput.addEventListener('change', () => {
  newHeroPreview.innerHTML = '';
  newHeroPreview.classList.add('empty');
  const file = heroImageInput.files && heroImageInput.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  img.onload = () => URL.revokeObjectURL(url);
  newHeroPreview.classList.remove('empty');
  newHeroPreview.appendChild(img);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  result.textContent = '保存中...';

  try {
    const memo = memoInput.value.trim();
    if (!memo) {
      result.innerHTML = '<span class="error">メモを入力してください。</span>';
      memoInput.focus();
      return;
    }
    if (memo.length > maxMemoLength) {
      result.innerHTML = '<span class="error">メモは30文字以内で入力してください。</span>';
      memoInput.focus();
      return;
    }
    if (countMemoLines(memo) > maxMemoLines) {
      result.innerHTML = '<span class="error">メモは3行以内で入力してください。</span>';
      memoInput.focus();
      return;
    }

    const fd = new FormData(form);
    const resp = await fetch('api/about-image', { method: 'POST', body: fd });
    const json = await readApiResponse(resp);

    if (!resp.ok || !json.ok) {
      result.innerHTML = `<span class="error">失敗: HTTP ${resp.status} ${json.message || resp.statusText}</span>`;
      return;
    }

    renderCurrent(json.settings);
    await loadImageHistory();
    result.innerHTML = `
      <div class="success">保存しました</div>
      <pre>${JSON.stringify(json.file, null, 2)}</pre>
    `;
    form.reset();
    newPreview.innerHTML = '';
    newPreview.classList.add('empty');
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    result.innerHTML = `<span class="error">通信エラー: ${message}</span>`;
  }
});

heroForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  result.textContent = '保存中...';

  try {
    const fd = new FormData(heroForm);
    const resp = await fetch('api/hero-image', { method: 'POST', body: fd });
    const json = await readApiResponse(resp);

    if (!resp.ok || !json.ok) {
      result.innerHTML = `<span class="error">失敗: HTTP ${resp.status} ${json.message || resp.statusText}</span>`;
      return;
    }

    renderCurrent(json.settings);
    await loadImageHistory();
    result.innerHTML = `
      <div class="success">保存しました</div>
      <pre>${JSON.stringify(json.file, null, 2)}</pre>
    `;
    heroForm.reset();
    newHeroPreview.innerHTML = '';
    newHeroPreview.classList.add('empty');
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    result.innerHTML = `<span class="error">通信エラー: ${message}</span>`;
  }
});

loadSettings();
