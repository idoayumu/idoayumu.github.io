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

async function loadSettings() {
  try {
    const resp = await fetch('api/settings');
    const json = await resp.json();
    if (!resp.ok || !json.ok) throw new Error(json.message || resp.statusText);
    renderCurrent(json.settings);
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
