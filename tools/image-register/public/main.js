const useSourcePathChk = document.getElementById('useSourcePath');
const fileMode = document.getElementById('fileMode');
const pathMode = document.getElementById('pathMode');
const imageFile = document.getElementById('imageFile');
const preview = document.getElementById('preview');
const form = document.getElementById('metaForm');
const result = document.getElementById('result');
const clearFormButton = document.getElementById('clearForm');
const modelIdsInput = document.getElementById('modelIds');
const modelSearch = document.getElementById('modelSearch');
const modelSuggestions = document.getElementById('modelSuggestions');
const productionsList = document.getElementById('productions');
const locationsList = document.getElementById('locations');
const titleInput = form.elements.title;
const workIdInput = document.getElementById('workId');
const registrationDateDisplay = document.getElementById('registrationDateDisplay');
const registrationDatePrefix = document.getElementById('registrationDatePrefix');
const workIdModelName = document.getElementById('workIdModelName');
const workIdSequence = document.getElementById('workIdSequence');
const workIdPreview = document.getElementById('workIdPreview');
const titleDuplicateWarning = document.getElementById('titleDuplicateWarning');

let modelCandidates = [];
let existingWorkTitles = [];

function todayParts() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const fullYear = String(year);

  return {
    display: `${fullYear}/${month}/${day}`,
    prefix: `${fullYear.slice(-2)}${month}${day}`
  };
}

function setRegistrationDate() {
  const registrationDate = todayParts();
  registrationDateDisplay.textContent = registrationDate.display;
  registrationDatePrefix.textContent = registrationDate.prefix;
}

function getGeneratedWorkId() {
  const modelName = workIdModelName.value.trim();
  const sequence = workIdSequence.value.trim();

  if (!/^[A-Za-z0-9_]+$/.test(modelName) || !/^\d{4}$/.test(sequence)) return '';
  return `${registrationDatePrefix.textContent}${modelName}_${sequence}`;
}

function updateWorkIdPreview() {
  const workId = getGeneratedWorkId();
  workIdInput.value = workId;
  workIdPreview.textContent = workId || '未入力';
  workIdPreview.classList.toggle('is-empty', !workId);
}

useSourcePathChk.addEventListener('change', () => {
  const usePath = useSourcePathChk.checked;
  pathMode.style.display = usePath ? '' : 'none';
  fileMode.style.display = usePath ? 'none' : '';
  preview.innerHTML = '';
  imageFile.value = '';
});

imageFile.addEventListener('change', () => {
  preview.innerHTML = '';
  const f = imageFile.files && imageFile.files[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  const img = new Image();
  img.src = url;
  img.style.maxWidth = '400px';
  img.style.maxHeight = '300px';
  img.onload = () => URL.revokeObjectURL(url);
  preview.appendChild(img);
});

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[ァ-ン]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

function normalizeTitle(value) {
  return String(value || '').trim().toLowerCase();
}

function renderTitleDuplicateWarning() {
  const title = normalizeTitle(titleInput.value);
  const hasDuplicate = title && existingWorkTitles.some((existingTitle) => normalizeTitle(existingTitle) === title);

  titleDuplicateWarning.textContent = hasDuplicate
    ? '同じタイトルの作品が既に存在します。必要であればそのまま登録できます。'
    : '';
}

function getSelectedModelIds() {
  const raw = modelIdsInput.value.trim();
  if (!raw) return [];

  if (raw.startsWith('[')) {
    try {
      return JSON.parse(raw).map((id) => String(id).trim()).filter(Boolean);
    } catch {
      return raw.split(',').map((id) => id.trim()).filter(Boolean);
    }
  }

  return raw.split(',').map((id) => id.trim()).filter(Boolean);
}

function setSelectedModelIds(ids) {
  modelIdsInput.value = ids.map((id) => id.trim()).filter(Boolean).join(',');
}

function addModelId(id) {
  const selected = getSelectedModelIds();
  if (!selected.includes(id)) {
    setSelectedModelIds([...selected, id]);
  }
  modelSearch.value = '';
  renderModelSuggestions();
  modelIdsInput.focus();
}

function resetImageInput() {
  useSourcePathChk.checked = false;
  pathMode.style.display = 'none';
  fileMode.style.display = '';
  preview.innerHTML = '';
  imageFile.value = '';
  document.getElementById('sourcePath').value = '';
}

function clearForm() {
  if (!window.confirm('フォーム内容を一括クリアします。よろしいですか？')) return;

  form.reset();
  resetImageInput();
  modelSearch.value = '';
  result.textContent = '';
  setRegistrationDate();
  updateWorkIdPreview();
  renderModelSuggestions();
  renderTitleDuplicateWarning();
  workIdModelName.focus();
}

function fillDatalist(list, values) {
  list.innerHTML = '';
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    list.appendChild(option);
  });
}

function renderModelSuggestions() {
  const query = normalizeText(modelSearch.value);
  const selected = new Set(getSelectedModelIds());
  modelSuggestions.innerHTML = '';

  if (!query) {
    modelSuggestions.textContent = 'モデル名やIDを入力すると候補が表示されます。';
    return;
  }

  const matches = modelCandidates
    .filter((model) => {
      const searchText = normalizeText([
        model.id,
        model.name,
        model.agency,
        ...(Array.isArray(model.aliases) ? model.aliases : [])
      ].join(' '));
      return searchText.includes(query);
    })
    .slice(0, 8);

  if (!matches.length) {
    modelSuggestions.textContent = '一致するモデル候補がありません。';
    return;
  }

  matches.forEach((model) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion-item';
    button.disabled = selected.has(model.id);
    button.addEventListener('click', () => addModelId(model.id));

    const name = document.createElement('span');
    name.className = 'suggestion-name';
    name.textContent = model.name || '(名称未設定)';

    const meta = document.createElement('span');
    meta.className = 'suggestion-meta';
    meta.textContent = [model.id, model.agency].filter(Boolean).join(' / ');

    button.append(name, meta);
    modelSuggestions.appendChild(button);
  });
}

async function loadSuggestions() {
  try {
    const resp = await fetch('/api/suggestions');
    const json = await resp.json();
    if (!resp.ok || !json.ok) throw new Error(json.message || resp.statusText);

    modelCandidates = json.models || [];
    existingWorkTitles = json.workTitles || [];
    fillDatalist(productionsList, json.productions || []);
    fillDatalist(locationsList, json.locations || []);
    renderModelSuggestions();
    renderTitleDuplicateWarning();
  } catch (err) {
    console.error(err);
    modelSuggestions.innerHTML = '<span class="error">候補データを読み込めません。</span>';
  }
}

setRegistrationDate();
updateWorkIdPreview();
workIdModelName.addEventListener('input', updateWorkIdPreview);
workIdSequence.addEventListener('input', updateWorkIdPreview);
titleInput.addEventListener('input', renderTitleDuplicateWarning);
clearFormButton.addEventListener('click', clearForm);
modelSearch.addEventListener('input', renderModelSuggestions);
modelIdsInput.addEventListener('input', renderModelSuggestions);
loadSuggestions();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  result.textContent = '登録中...';

  const fd = new FormData(form);
  const workId = getGeneratedWorkId();
  if (!workId) {
    result.innerHTML = '<span class="error">モデル名は半角英数字または _、通し番号は4桁数字で入力してください。</span>';
    return;
  }

  fd.set('id', workId);
  fd.set('modelIds', getSelectedModelIds().join(','));
  const usePath = useSourcePathChk.checked;
  fd.append('useSourcePath', usePath ? 'true' : 'false');

  if (usePath) {
    const p = document.getElementById('sourcePath').value.trim();
    if (!p) {
      result.textContent = 'sourcePath を入力してください。';
      return;
    }
    fd.append('sourcePath', p);
  } else {
    if (!imageFile.files || !imageFile.files[0]) {
      result.textContent = '画像ファイルを選択してください。';
      return;
    }
    fd.append('imageFile', imageFile.files[0]);
  }

  try {
    const resp = await fetch('/api/register', { method: 'POST', body: fd });
    const json = await resp.json();
    if (!resp.ok || !json.ok) {
      result.innerHTML = `<span class="error">失敗: ${json.message || resp.statusText}</span>`;
    } else {
      const e = json.entry;
      result.innerHTML = `
        <div class="success">登録成功</div>
        <pre>${JSON.stringify(e, null, 2)}</pre>
      `;
    }
  } catch (err) {
    console.error(err);
    result.innerHTML = `<span class="error">通信エラー</span>`;
  }
});
