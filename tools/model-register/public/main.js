const form = document.getElementById('modelForm');
const imageInput = document.getElementById('profileImage');
const preview = document.getElementById('preview');
const result = document.getElementById('result');
const warnings = document.getElementById('warnings');
const submitButton = document.getElementById('submitButton');
const confirmButton = document.getElementById('confirmButton');
const positionInputs = Array.from(form.elements.profileImagePosition || []);
const modeInputs = Array.from(document.querySelectorAll('input[name="mode"]'));
const editSelectorWrap = document.getElementById('editSelectorWrap');
const editModelSelect = document.getElementById('editModelSelect');
const editModelSearch = document.getElementById('editModelSearch');
const idInput = form.elements.id;
const nameKanaInput = form.elements.nameKana;
const nameKanaWarning = document.getElementById('nameKanaWarning');
const imageLabel = imageInput.closest('label');
const DEV_SITE_BASE_URL = 'http://localhost:4321';
const PROD_SITE_BASE_URL = 'https://idoayumu.github.io';

let pendingFormData = null;
let models = [];
let currentMode = 'create';

function buildSiteUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function renderConfirmLinks(type, id) {
  const detailPath = type === 'model' ? `/models/${id}/` : `/works/${id}/`;
  const listPath = type === 'model' ? '/models/' : '/works/';
  const detailLabel = type === 'model' ? 'モデルページ' : '作品ページ';
  const listLabel = type === 'model' ? 'Models一覧' : 'Works一覧';

  return `
    <div class="confirm-links">
      <p>反映確認</p>
      <div class="confirm-link-group">
        <a href="${buildSiteUrl(DEV_SITE_BASE_URL, detailPath)}" target="_blank" rel="noopener noreferrer">${detailLabel}を開く（Dev）</a>
        <a href="${buildSiteUrl(PROD_SITE_BASE_URL, detailPath)}" target="_blank" rel="noopener noreferrer">${detailLabel}を開く（本番）</a>
      </div>
      <div class="confirm-link-group">
        <a href="${buildSiteUrl(DEV_SITE_BASE_URL, listPath)}" target="_blank" rel="noopener noreferrer">${listLabel}を開く（Dev）</a>
        <a href="${buildSiteUrl(PROD_SITE_BASE_URL, listPath)}" target="_blank" rel="noopener noreferrer">${listLabel}を開く（本番）</a>
      </div>
    </div>
  `;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[ァ-ン]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

function getPreviewPosition() {
  const selected = positionInputs.find((input) => input.checked)?.value;
  if (selected === 'left') return 'left center';
  if (selected === 'right') return 'right center';
  return 'center';
}

function getPreviewShift() {
  const position = getPreviewPosition();
  if (position === 'left center') return '0%';
  if (position === 'right center') return '-10%';
  return '-5%';
}

function applyPreviewPosition(img) {
  img.style.objectPosition = getPreviewPosition();
  img.style.transform = `translateX(${getPreviewShift()})`;
}

function updatePreviewPosition() {
  const img = preview.querySelector('img');
  if (!img) return;
  applyPreviewPosition(img);
}

function positionValueFromStored(value) {
  if (value === 'left center') return 'left';
  if (value === 'right center') return 'right';
  return 'center';
}

function setPositionInput(value) {
  const normalized = positionValueFromStored(value);
  positionInputs.forEach((input) => {
    input.checked = input.value === normalized;
  });
  updatePreviewPosition();
}

function getModelImageSrc(model) {
  if (!model) return '';
  const imageName = model.thumbnail || model.profileImage || '';
  if (!imageName) return '';
  return imageName.startsWith('/images/')
    ? imageName
    : `/images/models/${imageName}`;
}

function renderPreview(src = '') {
  preview.innerHTML = '';
  if (!src) return;

  const img = new Image();
  img.src = src;
  applyPreviewPosition(img);
  preview.appendChild(img);
}

function selectedModel() {
  return models.find((model) => model.id === editModelSelect.value);
}

imageInput.addEventListener('change', () => {
  preview.innerHTML = '';
  const file = imageInput.files && imageInput.files[0];
  if (!file) {
    renderPreview(getModelImageSrc(selectedModel()));
    return;
  }

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  applyPreviewPosition(img);
  img.onload = () => URL.revokeObjectURL(url);
  preview.appendChild(img);
});

positionInputs.forEach((input) => {
  input.addEventListener('change', updatePreviewPosition);
});

function buildFormData(force = false) {
  const fd = new FormData(form);
  fd.append('force', force ? 'true' : 'false');
  fd.append('mode', currentMode);
  fd.set('profileImagePosition', getPreviewPosition());
  return fd;
}

async function readApiResponse(resp) {
  const contentType = resp.headers.get('content-type') || '';
  const text = await resp.text();

  if (contentType.includes('application/json')) {
    try {
      return { data: JSON.parse(text), rawText: text };
    } catch (err) {
      throw new Error(`HTTP ${resp.status}: JSONの解析に失敗しました。${text.slice(0, 200)}`);
    }
  }

  return {
    data: {
      ok: false,
      message: text.trim() || resp.statusText || 'サーバーから空の応答が返りました。'
    },
    rawText: text
  };
}

function modelOptionLabel(model) {
  return [model.name, model.agency, model.id].filter(Boolean).join(' / ');
}

function modelSearchText(model) {
  return normalizeText([
    model.id,
    model.name,
    model.displayName,
    model.nameKana,
    model.agency,
    ...(Array.isArray(model.aliases) ? model.aliases : [])
  ].join(' '));
}

function fillModelSelect() {
  const selectedValue = editModelSelect.value;
  const query = normalizeText(editModelSearch.value);
  const visibleModels = query
    ? models.filter((model) => modelSearchText(model).includes(query))
    : models;

  editModelSelect.innerHTML = '<option value="">選択してください</option>';
  visibleModels
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ja') || a.id.localeCompare(b.id))
    .forEach((model) => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = modelOptionLabel(model);
      editModelSelect.appendChild(option);
    });

  if (visibleModels.some((model) => model.id === selectedValue)) {
    editModelSelect.value = selectedValue;
  }
}

async function loadModels() {
  try {
    const resp = await fetch('api/models');
    const json = await resp.json();
    if (!resp.ok || !json.ok) throw new Error(json.message || resp.statusText);
    models = json.models || [];
    fillModelSelect();
  } catch (err) {
    console.error(err);
    result.innerHTML = '<span class="error">既存モデルを読み込めません。</span>';
  }
}

function renderNameKanaWarning() {
  if (!nameKanaWarning) return;
  nameKanaWarning.textContent = nameKanaInput.value.trim()
    ? ''
    : '読み仮名は50音順ソート・重複検知・ペア撮ID生成に使います。未入力のまま保存する場合は確認が必要です。';
}

function setMode(mode) {
  currentMode = mode;
  const isEdit = currentMode === 'edit';

  editSelectorWrap.hidden = !isEdit;
  idInput.readOnly = isEdit;
  imageInput.required = !isEdit;
  imageLabel.firstChild.textContent = isEdit ? 'プロフィール画像（変更する場合のみ選択）' : 'プロフィール画像';
  submitButton.textContent = isEdit ? '上書き保存' : '登録';
  confirmButton.textContent = isEdit ? '警告を確認して上書き保存' : '警告を確認して登録';
  confirmButton.hidden = true;
  warnings.innerHTML = '';
  result.textContent = '';
  pendingFormData = null;

  form.reset();
  modeInputs.forEach((input) => {
    input.checked = input.value === currentMode;
  });
  setPositionInput('center');
  preview.innerHTML = '';
  renderNameKanaWarning();

  if (isEdit) {
    editModelSelect.value = '';
    editModelSearch.value = '';
    fillModelSelect();
  }
}

function fillForm(model) {
  if (!model) return;
  const links = model.links || {};

  idInput.value = model.id || '';
  form.elements.name.value = model.name || '';
  form.elements.displayName.value = model.displayName || '';
  form.elements.nameKana.value = model.nameKana || '';
  form.elements.agency.value = model.agency || '';
  form.elements.x.value = links.x || links.twitter || '';
  form.elements.instagram.value = links.instagram || '';
  form.elements.threads.value = links.threads || '';
  form.elements.website.value = links.website || '';
  form.elements.websiteLabel.value = links.websiteLabel || '';
  form.elements.aliases.value = Array.isArray(model.aliases) ? model.aliases.join('\n') : '';
  imageInput.value = '';
  setPositionInput(model.profileImagePosition || 'center');
  renderPreview(getModelImageSrc(model));
  renderNameKanaWarning();
}

function renderWarnings(items) {
  if (!items || !items.length) {
    warnings.innerHTML = '';
    confirmButton.hidden = true;
    return;
  }

  warnings.innerHTML = `
    <div class="warning">
      <strong>似ているモデルが見つかりました。</strong>
      <ul>
        ${items.map((item) => `<li>${item.name} (${[item.agency, item.id].filter(Boolean).join(' / ')}) - ${item.matched}</li>`).join('')}
      </ul>
    </div>
  `;
  confirmButton.textContent = currentMode === 'edit' ? '警告を確認して上書き保存' : '警告を確認して登録';
  confirmButton.hidden = false;
}

async function submit(force = false) {
  result.textContent = currentMode === 'edit' ? '保存中...' : '登録中...';
  warnings.innerHTML = '';
  confirmButton.hidden = true;

  const fd = force && pendingFormData ? pendingFormData : buildFormData(force);
  if (force) fd.set('force', 'true');

  if (currentMode === 'create' && (!imageInput.files || !imageInput.files[0])) {
    result.innerHTML = '<span class="error">プロフィール画像を選択してください。</span>';
    return;
  }

  if (currentMode === 'edit' && !editModelSelect.value) {
    result.innerHTML = '<span class="error">編集するモデルを選択してください。</span>';
    return;
  }

  if (!nameKanaInput.value.trim() && !window.confirm('読み仮名が未入力です。50音順ソート・重複検知・ペア撮ID生成に影響します。このまま保存しますか？')) {
    result.innerHTML = '<span class="error">読み仮名を入力してから保存してください。</span>';
    return;
  }

  try {
    const endpoint = 'api/register';
    const resp = await fetch(endpoint, { method: 'POST', body: fd });
    const { data: json } = await readApiResponse(resp);

    if (json.needsConfirmation) {
      pendingFormData = buildFormData(false);
      renderWarnings(json.warnings);
      result.textContent = json.message;
      return;
    }

    if (!resp.ok || !json.ok) {
      const message = json.message || resp.statusText || '保存に失敗しました。';
      console.error('Model save failed', {
        endpoint,
        status: resp.status,
        statusText: resp.statusText,
        message
      });
      result.innerHTML = `<span class="error">失敗: HTTP ${resp.status} ${message}</span>`;
      return;
    }

    pendingFormData = null;
    renderWarnings(json.warnings);
    result.innerHTML = `
      <div class="success">${currentMode === 'edit' ? '上書き保存しました。' : '登録しました。'}</div>
      ${renderConfirmLinks('model', json.entry.id)}
      <pre>${JSON.stringify(json.entry, null, 2)}</pre>
    `;
    await loadModels();
    if (currentMode === 'edit') {
      editModelSelect.value = json.entry.id;
      fillForm(json.entry);
    } else {
      form.reset();
      setPositionInput('center');
      preview.innerHTML = '';
      renderNameKanaWarning();
    }
  } catch (err) {
    console.error('Model save request failed', err);
    const message = err instanceof Error ? err.message : String(err);
    result.innerHTML = `<span class="error">通信エラー: ${message}</span>`;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  pendingFormData = null;
  submit(false);
});

confirmButton.addEventListener('click', () => {
  submit(true);
});

modeInputs.forEach((input) => {
  input.addEventListener('change', () => setMode(input.value));
});

editModelSelect.addEventListener('change', () => {
  warnings.innerHTML = '';
  result.textContent = '';
  pendingFormData = null;
  fillForm(selectedModel());
});

editModelSearch.addEventListener('input', fillModelSelect);
nameKanaInput.addEventListener('input', renderNameKanaWarning);
renderNameKanaWarning();
loadModels();
