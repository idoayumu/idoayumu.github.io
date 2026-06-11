const useSourcePathChk = document.getElementById('useSourcePath');
const advancedImageOptions = document.querySelector('.advanced-image-options');
const fileMode = document.getElementById('fileMode');
const pathMode = document.getElementById('pathMode');
const imageFile = document.getElementById('imageFile');
const preview = document.getElementById('preview');
const imageInfo = document.getElementById('imageInfo');
const form = document.getElementById('metaForm');
const result = document.getElementById('result');
const clearFormButton = document.getElementById('clearForm');
const saveDraftButton = document.getElementById('saveDraft');
const restoreDraftButton = document.getElementById('restoreDraft');
const deleteDraftButton = document.getElementById('deleteDraft');
const saveConfirmPanel = document.getElementById('saveConfirmPanel');
const saveConfirmList = document.getElementById('saveConfirmList');
const executeSaveButton = document.getElementById('executeSave');
const cancelSaveConfirmButton = document.getElementById('cancelSaveConfirm');
const modelIdsInput = document.getElementById('modelIds');
const modelSearch = document.getElementById('modelSearch');
const modelSuggestions = document.getElementById('modelSuggestions');
const selectedModels = document.getElementById('selectedModels');
const productionsList = document.getElementById('productions');
const locationsList = document.getElementById('locations');
const titleInput = form.elements.title;
const workIdInput = document.getElementById('workId');
const registrationDateDisplay = document.getElementById('registrationDateDisplay');
const registrationDatePrefix = document.getElementById('registrationDatePrefix');
const workIdModelName = document.getElementById('workIdModelName');
const workIdSequence = document.getElementById('workIdSequence');
const workIdPreview = document.getElementById('workIdPreview');
const workIdDuplicateWarning = document.getElementById('workIdDuplicateWarning');
const titleDuplicateWarning = document.getElementById('titleDuplicateWarning');
const modeInputs = Array.from(document.querySelectorAll('input[name="modeSwitch"]'));
const editWorkSelectorWrap = document.getElementById('editWorkSelectorWrap');
const editWorkSelect = document.getElementById('editWorkSelect');
const editWorkSearch = document.getElementById('editWorkSearch');
const editImageNote = document.getElementById('editImageNote');
const editIdNote = document.getElementById('editIdNote');
const overwriteWrap = document.getElementById('overwriteWrap');
const productionInput = form.elements.production;
const submitButton = form.querySelector('button[type="submit"]');
const DEV_SITE_BASE_URL = 'http://localhost:4321';
const PROD_SITE_BASE_URL = 'https://idoayumu.github.io';
const DRAFT_STORAGE_KEY = 'kokei-note.work-register.draft.v1';

let modelCandidates = [];
let works = [];
let existingWorkTitles = [];
let currentMode = 'create';
let currentEditWork = null;

function hideSaveConfirmation() {
  saveConfirmPanel.hidden = true;
  saveConfirmList.innerHTML = '';
}

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

function renderPostSaveActions(entry) {
  const workUrl = buildSiteUrl(PROD_SITE_BASE_URL, `/works/${entry.id}/`);
  return `
    <div class="post-save-actions" data-saved-work-id="${entry.id}">
      <a class="primary-button action-link" href="${workUrl}" target="_blank" rel="noopener noreferrer">登録作品を開く</a>
      <button type="button" class="secondary-button" data-next-action="same-model">同じモデルで次を登録</button>
      <button type="button" class="secondary-button" data-next-action="blank">空にして次を登録</button>
    </div>
  `;
}

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

function setRegistrationDate(parts = todayParts()) {
  registrationDateDisplay.textContent = parts.display;
  registrationDatePrefix.textContent = parts.prefix;
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
  renderWorkIdDuplicateWarning();
  renderImageInfo();
}

function isGeneratedWorkIdDuplicate() {
  const workId = getGeneratedWorkId();
  if (!workId) return false;
  const currentId = currentMode === 'edit' ? currentEditWork?.id : '';
  return works.some((work) => work.id === workId && work.id !== currentId);
}

function renderWorkIdDuplicateWarning() {
  const hasDuplicate = isGeneratedWorkIdDuplicate();
  workIdDuplicateWarning.textContent = hasDuplicate
    ? 'この作品IDはすでに使用されています'
    : '';
  if (submitButton) {
    submitButton.disabled = hasDuplicate;
    submitButton.title = hasDuplicate ? '作品IDが重複しているため保存できません。' : '';
  }
}

useSourcePathChk.addEventListener('change', () => {
  const usePath = useSourcePathChk.checked;
  pathMode.hidden = !usePath;
  fileMode.hidden = usePath;
  if (usePath) {
    preview.innerHTML = '';
  } else if (currentMode === 'edit' && currentEditWork && !imageFile.files?.[0]) {
    renderExistingWorkPreview(currentEditWork);
  }
  imageFile.value = '';
  renderImageInfo();
  hideSaveConfirmation();
});

imageFile.addEventListener('change', () => {
  preview.innerHTML = '';
  renderImageInfo();
  const f = imageFile.files && imageFile.files[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  const img = new Image();
  img.src = url;
  img.onload = () => URL.revokeObjectURL(url);
  preview.appendChild(img);
  renderImageInfo();
  hideSaveConfirmation();
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
  const currentId = currentMode === 'edit' ? currentEditWork?.id : '';
  const hasDuplicate = title && existingWorkTitles.some((work) => (
    work.id !== currentId && normalizeTitle(work.title) === title
  ));

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

function getModelSortValue(model, id) {
  return normalizeText(model?.nameKana || model?.name || id);
}

function getSortedModelIdsForWorkId() {
  return getSelectedModelIds()
    .map((id) => ({
      id,
      model: modelCandidates.find((candidate) => candidate.id === id)
    }))
    .sort((a, b) => {
      const sortByName = getModelSortValue(a.model, a.id).localeCompare(getModelSortValue(b.model, b.id), 'ja');
      if (sortByName !== 0) return sortByName;
      return a.id.localeCompare(b.id);
    })
    .map((item) => item.id);
}

function syncWorkIdModelNameFromSelection() {
  const generatedModelName = getSortedModelIdsForWorkId().join('_');
  workIdModelName.value = generatedModelName;
  updateWorkIdPreview();
}

function addModelId(id) {
  const selected = getSelectedModelIds();
  if (!selected.includes(id)) {
    setSelectedModelIds([...selected, id]);
  }
  syncWorkIdModelNameFromSelection();
  modelSearch.value = '';
  renderSelectedModels();
  renderModelSuggestions();
  modelSearch.focus();
}

function removeModelId(id) {
  const selected = getSelectedModelIds().filter((modelId) => modelId !== id);
  setSelectedModelIds(selected);
  syncWorkIdModelNameFromSelection();
  renderSelectedModels();
  renderModelSuggestions();
}

function getModelLabel(model) {
  return model.displayName
    ? `${model.name}（${model.displayName}）`
    : model.name || '(名称未設定)';
}

function renderSelectedModels() {
  const selected = getSelectedModelIds();
  selectedModels.innerHTML = '';

  if (!selected.length) {
    selectedModels.textContent = '未選択';
    selectedModels.classList.add('is-empty');
    return;
  }

  selectedModels.classList.remove('is-empty');

  selected.forEach((id) => {
    const model = modelCandidates.find((candidate) => candidate.id === id);
    const tag = document.createElement('button');
    tag.type = 'button';
    tag.className = 'model-tag';
    tag.addEventListener('click', () => removeModelId(id));

    const label = model
      ? [getModelLabel(model), model.agency].filter(Boolean).join(' / ')
      : id;

    tag.textContent = `${label} ×`;
    selectedModels.appendChild(tag);
  });
}

function renderImageInfo() {
  const file = imageFile.files && imageFile.files[0];
  const workId = getGeneratedWorkId();
  const existingImage = currentMode === 'edit' && currentEditWork
    ? currentEditWork.image || currentEditWork.thumbnail || ''
    : '';

  if (!file && !workId && !existingImage) {
    imageInfo.innerHTML = '';
    return;
  }

  const fileName = file ? file.name : currentMode === 'edit' ? '未選択（既存画像を維持）' : '未選択';
  imageInfo.innerHTML = '';

  const list = document.createElement('dl');

  [
    ['選択画像', fileName],
    ['生成予定ID', workId || '未入力'],
    ...(existingImage ? [['既存画像', existingImage]] : [])
  ].forEach(([label, value]) => {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');

    term.textContent = label;
    description.textContent = value;
    row.append(term, description);
    list.appendChild(row);
  });

  imageInfo.appendChild(list);
}

function selectedModelLabels() {
  return getSelectedModelIds().map((id) => {
    const model = modelCandidates.find((candidate) => candidate.id === id);
    return model ? getModelLabel(model) : id;
  });
}

function getImageSummary() {
  const usePath = useSourcePathChk.checked;
  const sourcePath = document.getElementById('sourcePath').value.trim();
  const file = imageFile.files && imageFile.files[0];

  if (usePath) return sourcePath ? `絶対パス: ${sourcePath}` : '絶対パス未入力';
  if (file) return `${file.name} (${Math.round(file.size / 1024).toLocaleString()} KB)`;
  if (currentMode === 'edit' && currentEditWork) return '未選択（既存画像を維持）';
  return '未選択';
}

function collectDraft() {
  return {
    savedAt: new Date().toISOString(),
    mode: currentMode,
    editWorkId: currentEditWork?.id || editWorkSelect.value || '',
    title: form.elements.title.value,
    date: form.elements.date.value,
    location: form.elements.location.value,
    production: form.elements.production.value,
    caption: form.elements.caption.value,
    modelIds: modelIdsInput.value,
    workIdModelName: workIdModelName.value,
    workIdSequence: workIdSequence.value,
    overwrite: form.elements.overwrite?.value || 'skip',
    useSourcePath: useSourcePathChk.checked,
    sourcePath: document.getElementById('sourcePath').value
  };
}

function applyDraft(draft) {
  if (!draft || typeof draft !== 'object') return false;

  setMode(draft.mode === 'edit' ? 'edit' : 'create');

  if (draft.mode === 'edit' && draft.editWorkId) {
    editWorkSelect.value = draft.editWorkId;
    fillFormFromWork(works.find((work) => work.id === draft.editWorkId));
  }

  form.elements.title.value = draft.title || '';
  form.elements.date.value = draft.date || '';
  form.elements.location.value = draft.location || '';
  form.elements.production.value = draft.production || '';
  form.elements.caption.value = draft.caption || '';
  if (form.elements.overwrite) form.elements.overwrite.value = draft.overwrite || 'skip';
  setSelectedModelIds(String(draft.modelIds || '').split(',').map((id) => id.trim()).filter(Boolean));
  workIdModelName.value = draft.workIdModelName || '';
  workIdSequence.value = draft.workIdSequence || '';
  useSourcePathChk.checked = Boolean(draft.useSourcePath);
  pathMode.hidden = !useSourcePathChk.checked;
  fileMode.hidden = useSourcePathChk.checked;
  if (advancedImageOptions) advancedImageOptions.open = useSourcePathChk.checked;
  document.getElementById('sourcePath').value = draft.sourcePath || '';
  imageFile.value = '';
  preview.innerHTML = '';

  if (currentMode === 'edit' && currentEditWork && !useSourcePathChk.checked) {
    renderExistingWorkPreview(currentEditWork);
  }

  updateWorkIdPreview();
  renderSelectedModels();
  renderModelSuggestions();
  renderTitleDuplicateWarning();
  hideSaveConfirmation();
  return true;
}

function saveDraft() {
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(collectDraft()));
  result.innerHTML = '<div class="success">下書きを保存しました。画像ファイル自体は保存されません。</div>';
  hideSaveConfirmation();
}

function restoreDraft() {
  const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
  if (!raw) {
    result.innerHTML = '<span class="error">復元できる下書きがありません。</span>';
    return;
  }

  try {
    const draft = JSON.parse(raw);
    if (!applyDraft(draft)) throw new Error('invalid draft');
    result.innerHTML = '<div class="success">下書きを復元しました。画像は必要に応じて選び直してください。</div>';
  } catch (err) {
    console.error(err);
    result.innerHTML = '<span class="error">下書きを復元できませんでした。</span>';
  }
}

function deleteDraft() {
  if (!localStorage.getItem(DRAFT_STORAGE_KEY)) {
    result.innerHTML = '<span class="error">削除できる下書きがありません。</span>';
    return;
  }
  if (!window.confirm('保存済みの下書きを削除します。よろしいですか？')) return;
  localStorage.removeItem(DRAFT_STORAGE_KEY);
  result.innerHTML = '<div class="success">下書きを削除しました。</div>';
  hideSaveConfirmation();
}

function clearWorkSpecificFields() {
  form.elements.title.value = '';
  form.elements.caption.value = '';
  workIdInput.value = '';
  workIdModelName.value = '';
  workIdSequence.value = '';
  workIdPreview.textContent = '未入力';
  workIdPreview.classList.add('is-empty');
  workIdDuplicateWarning.textContent = '';
  titleDuplicateWarning.textContent = '';
  resetImageInput();
}

function startNextWithSameModel() {
  localStorage.removeItem(DRAFT_STORAGE_KEY);
  const keep = {
    date: form.elements.date.value,
    location: form.elements.location.value,
    production: form.elements.production.value,
    modelIds: getSelectedModelIds(),
    workIdModelName: workIdModelName.value
  };

  setMode('create');
  form.elements.date.value = keep.date;
  form.elements.location.value = keep.location;
  form.elements.production.value = keep.production;
  setSelectedModelIds(keep.modelIds);
  clearWorkSpecificFields();
  workIdModelName.value = keep.workIdModelName;
  updateWorkIdPreview();
  renderSelectedModels();
  renderModelSuggestions();
  renderImageInfo();
  hideSaveConfirmation();
  result.textContent = '同じモデルで次の登録を開始できます。画像を選択してください。';
  imageFile.focus();
}

function startNextBlank() {
  localStorage.removeItem(DRAFT_STORAGE_KEY);
  setMode('create');
  form.reset();
  resetImageInput();
  modelSearch.value = '';
  setSelectedModelIds([]);
  setRegistrationDate();
  updateWorkIdPreview();
  renderSelectedModels();
  renderModelSuggestions();
  renderTitleDuplicateWarning();
  hideSaveConfirmation();
  result.textContent = '新しい登録を開始できます。画像を選択してください。';
  imageFile.focus();
}

function resetImageInput() {
  useSourcePathChk.checked = false;
  if (advancedImageOptions) advancedImageOptions.open = false;
  pathMode.hidden = true;
  fileMode.hidden = false;
  preview.innerHTML = '';
  imageInfo.innerHTML = '';
  imageFile.value = '';
  document.getElementById('sourcePath').value = '';
}

function renderExistingWorkPreview(work) {
  preview.innerHTML = '';
  const src = work?.image || work?.thumbnail || '';
  if (!src) return;

  const img = new Image();
  img.src = src;
  preview.appendChild(img);
}

function parseWorkIdParts(id) {
  const match = String(id || '').match(/^(\d{2})(\d{2})(\d{2})([A-Za-z0-9][A-Za-z0-9_]*)_(\d{4})$/);
  if (!match) return null;

  const [, year, month, day, modelName, sequence] = match;
  return {
    display: `20${year}/${month}/${day}`,
    prefix: `${year}${month}${day}`,
    modelName,
    sequence
  };
}

function setMode(mode) {
  currentMode = mode;
  const isEdit = currentMode === 'edit';

  editWorkSelectorWrap.hidden = !isEdit;
  editImageNote.hidden = !isEdit;
  editIdNote.hidden = !isEdit;
  overwriteWrap.hidden = isEdit;
  productionInput.required = !isEdit;
  clearFormButton.textContent = isEdit ? '入力を戻す' : '一括クリア';
  submitButton.textContent = isEdit ? '保存' : '決定（登録）';
  currentEditWork = null;
  editWorkSelect.value = '';
  editWorkSearch.value = '';
  result.textContent = '';
  hideSaveConfirmation();
  modelSearch.value = '';
  form.reset();
  modeInputs.forEach((input) => {
    input.checked = input.value === currentMode;
  });
  resetImageInput();
  setRegistrationDate();
  updateWorkIdPreview();
  renderSelectedModels();
  renderModelSuggestions();
  renderTitleDuplicateWarning();
}

function workOptionLabel(work) {
  const models = Array.isArray(work.modelNames) && work.modelNames.length
    ? work.modelNames.join('・')
    : getWorkModelIds(work).join(',');
  return [work.id, work.title, models].filter(Boolean).join(' / ');
}

function workSearchText(work) {
  return normalizeText([
    work.id,
    work.title,
    ...(Array.isArray(work.modelNames) ? work.modelNames : []),
    ...getWorkModelIds(work),
    work.date,
    work.location
  ].join(' '));
}

function getWorkModelIds(work) {
  return Array.isArray(work?.modelIds) ? work.modelIds : work?.models || [];
}

function fillWorkSelect() {
  const selectedValue = editWorkSelect.value;
  const query = normalizeText(editWorkSearch.value);
  const visibleWorks = query
    ? works.filter((work) => workSearchText(work).includes(query))
    : works;

  editWorkSelect.innerHTML = '<option value="">選択してください</option>';
  visibleWorks.forEach((work) => {
    const option = document.createElement('option');
    option.value = work.id;
    option.textContent = workOptionLabel(work);
    editWorkSelect.appendChild(option);
  });

  if (visibleWorks.some((work) => work.id === selectedValue)) {
    editWorkSelect.value = selectedValue;
  }
}

async function loadWorks() {
  try {
    const resp = await fetch('api/works');
    const json = await resp.json();
    if (!resp.ok || !json.ok) throw new Error(json.message || resp.statusText);
    works = json.works || [];
    fillWorkSelect();
    renderWorkIdDuplicateWarning();
  } catch (err) {
    console.error(err);
    result.innerHTML = '<span class="error">既存作品を読み込めません。</span>';
  }
}

function fillFormFromWork(work) {
  if (!work) return;
  currentEditWork = work;

  form.elements.title.value = work.title || '';
  form.elements.date.value = work.date || '';
  form.elements.location.value = work.location || '';
  form.elements.production.value = work.production || '';
  form.elements.caption.value = work.caption || '';
  setSelectedModelIds(getWorkModelIds(work));

  const idParts = parseWorkIdParts(work.id);
  if (idParts) {
    setRegistrationDate({ display: idParts.display, prefix: idParts.prefix });
    workIdModelName.value = idParts.modelName;
    workIdSequence.value = idParts.sequence;
  } else {
    syncWorkIdModelNameFromSelection();
    workIdSequence.value = '';
  }

  resetImageInput();
  renderExistingWorkPreview(work);
  updateWorkIdPreview();
  renderSelectedModels();
  renderModelSuggestions();
  renderTitleDuplicateWarning();
}

function clearForm() {
  if (currentMode === 'edit' && currentEditWork) {
    if (!window.confirm('編集中の入力を選択時の内容へ戻します。よろしいですか？')) return;
    fillFormFromWork(currentEditWork);
    result.textContent = '';
    hideSaveConfirmation();
    return;
  }

  if (!window.confirm('フォーム内容を一括クリアします。よろしいですか？')) return;

  form.reset();
  resetImageInput();
  modelSearch.value = '';
  result.textContent = '';
  hideSaveConfirmation();
  setRegistrationDate();
  updateWorkIdPreview();
  renderSelectedModels();
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
        model.displayName,
        model.nameKana,
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
    name.textContent = getModelLabel(model);

    const meta = document.createElement('span');
    meta.className = 'suggestion-meta';
    const metaItems = [
      model.agency ? `所属: ${model.agency}` : '所属: 未設定',
      `ID: ${model.id}`,
      `${model.workCount || 0} works`,
      model.nameKana ? `読み: ${model.nameKana}` : '',
      Array.isArray(model.aliases) && model.aliases.length ? `別名: ${model.aliases.join(', ')}` : ''
    ].filter(Boolean);
    meta.textContent = metaItems.join(' / ');

    button.append(name, meta);
    modelSuggestions.appendChild(button);
  });
}

async function loadSuggestions() {
  try {
    const resp = await fetch('api/suggestions');
    const json = await resp.json();
    if (!resp.ok || !json.ok) throw new Error(json.message || resp.statusText);

    modelCandidates = json.models || [];
    existingWorkTitles = (json.workTitleEntries || []).length
      ? json.workTitleEntries
      : (json.workTitles || []).map((title) => ({ id: '', title }));
    fillDatalist(productionsList, json.productions || []);
    fillDatalist(locationsList, json.locations || []);
    renderSelectedModels();
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
workIdModelName.addEventListener('input', hideSaveConfirmation);
workIdSequence.addEventListener('input', hideSaveConfirmation);
titleInput.addEventListener('input', () => {
  renderTitleDuplicateWarning();
  hideSaveConfirmation();
});
clearFormButton.addEventListener('click', clearForm);
modelSearch.addEventListener('input', renderModelSuggestions);
editWorkSearch.addEventListener('input', fillWorkSelect);
modelIdsInput.addEventListener('input', () => {
  syncWorkIdModelNameFromSelection();
  renderSelectedModels();
  renderModelSuggestions();
  hideSaveConfirmation();
});
loadSuggestions();
loadWorks();

async function readApiResponse(resp) {
  const contentType = resp.headers.get('content-type') || '';
  const text = await resp.text();

  if (contentType.includes('application/json')) {
    try {
      return { data: JSON.parse(text) };
    } catch {
      throw new Error(`HTTP ${resp.status}: JSONの解析に失敗しました。${text.slice(0, 200)}`);
    }
  }

  return {
    data: {
      ok: false,
      message: text.trim() || resp.statusText || 'サーバーから空の応答が返りました。'
    }
  };
}

function validateBeforeConfirmation() {
  const workId = getGeneratedWorkId();
  if (currentMode === 'create' && !workId) {
    result.innerHTML = '<span class="error">モデル名は半角英数字または _、通し番号は4桁数字で入力してください。</span>';
    return false;
  }

  if (currentMode === 'edit' && !currentEditWork) {
    result.innerHTML = '<span class="error">編集する作品を選択してください。</span>';
    return false;
  }

  if (isGeneratedWorkIdDuplicate()) {
    renderWorkIdDuplicateWarning();
    result.innerHTML = '<span class="error">この作品IDはすでに使用されています。通し番号などを変更してください。</span>';
    return false;
  }

  if (useSourcePathChk.checked) {
    const p = document.getElementById('sourcePath').value.trim();
    if (!p) {
      result.textContent = 'sourcePath を入力してください。';
      return false;
    }
  } else if (currentMode === 'create' && (!imageFile.files || !imageFile.files[0])) {
    result.textContent = '画像ファイルを選択してください。';
    return false;
  }

  return true;
}

function appendConfirmRow(label, value) {
  const row = document.createElement('div');
  const term = document.createElement('dt');
  const description = document.createElement('dd');
  term.textContent = label;
  description.textContent = value || '未設定';
  row.append(term, description);
  saveConfirmList.appendChild(row);
}

function showSaveConfirmation() {
  if (!validateBeforeConfirmation()) {
    hideSaveConfirmation();
    return;
  }

  saveConfirmList.innerHTML = '';
  appendConfirmRow('保存モード', currentMode === 'edit' ? '既存作品を編集' : '新規登録');
  appendConfirmRow('作品ID', currentMode === 'edit' ? currentEditWork.id : getGeneratedWorkId());
  appendConfirmRow('タイトル', form.elements.title.value.trim());
  appendConfirmRow('撮影日', form.elements.date.value);
  appendConfirmRow('撮影場所', form.elements.location.value.trim());
  appendConfirmRow('Production', form.elements.production.value.trim());
  appendConfirmRow('モデル', selectedModelLabels().join(' / '));
  appendConfirmRow('画像', getImageSummary());
  saveConfirmPanel.hidden = false;
  result.textContent = '';
  saveConfirmPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function executeSave() {
  if (!form.reportValidity() || !validateBeforeConfirmation()) return;
  result.textContent = currentMode === 'edit' ? '保存中...' : '登録中...';

  const fd = new FormData(form);
  const workId = getGeneratedWorkId();
  if (currentMode === 'create' && !workId) {
    result.innerHTML = '<span class="error">モデル名は半角英数字または _、通し番号は4桁数字で入力してください。</span>';
    return;
  }

  if (currentMode === 'edit' && !currentEditWork) {
    result.innerHTML = '<span class="error">編集する作品を選択してください。</span>';
    return;
  }

  if (isGeneratedWorkIdDuplicate()) {
    renderWorkIdDuplicateWarning();
    result.innerHTML = '<span class="error">この作品IDはすでに使用されています。通し番号などを変更してください。</span>';
    return;
  }

  fd.set('id', currentMode === 'edit' ? currentEditWork.id : workId);
  fd.set('mode', currentMode);
  fd.set('modelIds', getSelectedModelIds().join(','));
  const usePath = useSourcePathChk.checked;
  fd.append('useSourcePath', usePath ? 'true' : 'false');

  const updatesExistingImage = currentMode === 'edit' && (usePath || Boolean(imageFile.files && imageFile.files[0]));
  if (updatesExistingImage && !window.confirm('既存画像を上書きします。元画像は .bak に退避しますが、表示画像は置き換わります。続行しますか？')) {
    result.textContent = '画像上書きをキャンセルしました。';
    return;
  }

  if (usePath) {
    const p = document.getElementById('sourcePath').value.trim();
    if (!p) {
      result.textContent = 'sourcePath を入力してください。';
      return;
    }
    fd.append('sourcePath', p);
  } else if (currentMode === 'create') {
    if (!imageFile.files || !imageFile.files[0]) {
      result.textContent = '画像ファイルを選択してください。';
      return;
    }
    fd.set('imageFile', imageFile.files[0]);
  } else if (imageFile.files && imageFile.files[0]) {
    fd.set('imageFile', imageFile.files[0]);
  }

  try {
    const resp = await fetch('api/register', { method: 'POST', body: fd });
    const { data: json } = await readApiResponse(resp);
    if (!resp.ok || !json.ok) {
      result.innerHTML = `<span class="error">失敗: HTTP ${resp.status} ${json.message || resp.statusText}</span>`;
    } else {
      const e = json.entry;
      result.innerHTML = `
        <div class="success">${currentMode === 'edit' ? '上書き保存しました。' : '登録しました。'}</div>
        ${renderPostSaveActions(e)}
        ${renderConfirmLinks('work', e.id)}
        <details class="saved-json-details">
          <summary>詳細を表示</summary>
          <pre>${JSON.stringify(e, null, 2)}</pre>
        </details>
      `;
      await Promise.all([loadSuggestions(), loadWorks()]);
      hideSaveConfirmation();
      if (currentMode === 'edit') {
        editWorkSelect.value = e.id;
        fillFormFromWork(e);
      }
    }
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    result.innerHTML = `<span class="error">通信エラー: ${message}</span>`;
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  showSaveConfirmation();
});

executeSaveButton.addEventListener('click', executeSave);
cancelSaveConfirmButton.addEventListener('click', () => {
  hideSaveConfirmation();
  result.textContent = '保存前確認を閉じました。内容を修正できます。';
});
saveDraftButton.addEventListener('click', saveDraft);
restoreDraftButton.addEventListener('click', restoreDraft);
deleteDraftButton.addEventListener('click', deleteDraft);

result.addEventListener('click', (event) => {
  const button = event.target.closest('[data-next-action]');
  if (!button) return;

  const action = button.getAttribute('data-next-action');
  if (action === 'same-model') {
    startNextWithSameModel();
  } else if (action === 'blank') {
    startNextBlank();
  }
});

modeInputs.forEach((input) => {
  input.addEventListener('change', () => setMode(input.value));
});

editWorkSelect.addEventListener('change', () => {
  result.textContent = '';
  const work = works.find((item) => item.id === editWorkSelect.value);
  fillFormFromWork(work);
});
