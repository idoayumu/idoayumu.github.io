(function () {
  const siteImageBaseUrl = 'https://idoayumu.github.io';
  const page = document.body.dataset.staticList || '';
  const list = document.getElementById('staticList');
  const search = document.getElementById('staticSearch');
  const message = document.getElementById('staticMessage');
  const previewGeneratedWorkId = document.getElementById('previewGeneratedWorkId');
  const copyGeneratedWorkId = document.getElementById('copyGeneratedWorkId');
  const registrationDateNote = document.getElementById('registrationDateNote');
  const previewTitle = document.getElementById('previewTitle');
  const previewDate = document.getElementById('previewDate');
  const previewLocation = document.getElementById('previewLocation');
  const previewProduction = document.getElementById('previewProduction');
  const previewCaption = document.getElementById('previewCaption');
  const previewModelIds = document.getElementById('previewModelIds');
  const previewImageInput = document.getElementById('previewImageInput');
  const saveModeInputs = Array.from(document.querySelectorAll('input[name="workSaveMode"]'));
  const previewMessage = document.getElementById('previewMessage');
  const previewMeta = document.getElementById('previewMeta');
  const previewImages = document.getElementById('previewImages');
  const webpPreviewItems = Array.from(document.querySelectorAll('[data-webp-preview]'));
  const previewFileName = document.getElementById('previewFileName');
  const previewMimeType = document.getElementById('previewMimeType');
  const previewFileSize = document.getElementById('previewFileSize');
  const previewImageSize = document.getElementById('previewImageSize');
  const previewOriginalImage = document.getElementById('previewOriginalImage');
  const previewLargeImage = document.getElementById('previewLargeImage');
  const previewThumbImage = document.getElementById('previewThumbImage');
  const previewLargeMeta = document.getElementById('previewLargeMeta');
  const previewThumbMeta = document.getElementById('previewThumbMeta');
  const savePreviewSummary = document.getElementById('savePreviewSummary');
  const confirmWorkId = document.getElementById('confirmWorkId');
  const confirmTitle = document.getElementById('confirmTitle');
  const confirmDate = document.getElementById('confirmDate');
  const confirmModels = document.getElementById('confirmModels');
  const confirmModelIds = document.getElementById('confirmModelIds');
  const confirmOriginalFileName = document.getElementById('confirmOriginalFileName');
  const confirmOriginalMime = document.getElementById('confirmOriginalMime');
  const confirmOriginalSize = document.getElementById('confirmOriginalSize');
  const confirmPendingPath = document.getElementById('confirmPendingPath');
  const confirmLargePath = document.getElementById('confirmLargePath');
  const confirmThumbPath = document.getElementById('confirmThumbPath');
  const confirmBranch = document.getElementById('confirmBranch');
  const savePendingWork = document.getElementById('savePendingWork');
  const saveWorkWithImages = document.getElementById('saveWorkWithImages');
  const saveWorkEdit = document.getElementById('saveWorkEdit');
  const cancelWorkEdit = document.getElementById('cancelWorkEdit');
  const saveApiResult = document.getElementById('saveApiResult');
  const retryPendingSave = document.getElementById('retryPendingSave');
  const postSaveActions = document.getElementById('postSaveActions');
  const postSaveBranch = document.getElementById('postSaveBranch');
  const postSaveCommitUrl = document.getElementById('postSaveCommitUrl');
  const postSavePendingFiles = document.getElementById('postSavePendingFiles');
  const continueSameModelWork = document.getElementById('continueSameModelWork');
  const clearNextWork = document.getElementById('clearNextWork');
  const goWorksList = document.getElementById('goWorksList');
  const openGitHubActions = document.getElementById('openGitHubActions');
  const modelFormIdBase = document.getElementById('modelFormIdBase');
  const modelFormIdSuffix = document.getElementById('modelFormIdSuffix');
  const modelFormId = document.getElementById('modelFormId');
  const modelFormName = document.getElementById('modelFormName');
  const modelIdError = document.getElementById('modelIdError');
  const modelFormShortName = document.getElementById('modelFormShortName');
  const modelFormYomi = document.getElementById('modelFormYomi');
  const modelFormAgency = document.getElementById('modelFormAgency');
  const modelProfileImageInput = document.getElementById('modelProfileImageInput');
  const modelProfilePreview = document.getElementById('modelProfilePreview');
  const modelProfilePreviewImage = document.getElementById('modelProfilePreviewImage');
  const modelProfileFileName = document.getElementById('modelProfileFileName');
  const modelProfileMimeType = document.getElementById('modelProfileMimeType');
  const modelProfileFileSize = document.getElementById('modelProfileFileSize');
  const modelCurrentProfileImage = document.getElementById('modelCurrentProfileImage');
  const modelCurrentProfileImageThumb = document.getElementById('modelCurrentProfileImageThumb');
  const modelCurrentProfileImagePath = document.getElementById('modelCurrentProfileImagePath');
  const modelFormProfileImage = document.getElementById('modelFormProfileImage');
  const modelFormX = document.getElementById('modelFormX');
  const modelFormInstagram = document.getElementById('modelFormInstagram');
  const modelFormThreads = document.getElementById('modelFormThreads');
  const modelFormOtherUrl = document.getElementById('modelFormOtherUrl');
  const modelFormOtherLabel = document.getElementById('modelFormOtherLabel');
  const modelEditNotice = document.getElementById('modelEditNotice');
  const modelProfileImageField = document.getElementById('modelProfileImageField');
  const modelProfileAdvancedOption = document.getElementById('modelProfileAdvancedOption');
  const saveModelDev = document.getElementById('saveModelDev');
  const saveModelImageReplace = document.getElementById('saveModelImageReplace');
  const cancelModelEdit = document.getElementById('cancelModelEdit');
  const modelFormMessage = document.getElementById('modelFormMessage');
  const modelSaveResult = document.getElementById('modelSaveResult');
  const modelPostSaveActions = document.getElementById('modelPostSaveActions');
  const modelPostSaveBranch = document.getElementById('modelPostSaveBranch');
  const modelPostSaveCommitUrl = document.getElementById('modelPostSaveCommitUrl');
  const modelPostSaveFiles = document.getElementById('modelPostSaveFiles');
  const continueModelRegister = document.getElementById('continueModelRegister');
  const goModelsList = document.getElementById('goModelsList');
  const openModelGitHubActions = document.getElementById('openModelGitHubActions');
  const largeMaxEdge = 2000;
  const thumbMaxEdge = 700;
  const saveBranch = 'dev';
  const githubActionsUrl = 'https://github.com/idoayumu/idoayumu.github.io/actions/workflows/process-pending-work.yml';
  const githubActionsIndexUrl = 'https://github.com/idoayumu/idoayumu.github.io/actions';
  let originalPreviewUrl = '';
  let largePreviewUrl = '';
  let thumbPreviewUrl = '';
  let selectedOriginalFile = null;
  let generatedLargeBlob = null;
  let generatedThumbBlob = null;
  let generatedExtension = 'webp';
  let generatedWorkId = '';
  let editingWorkId = '';
  let pendingSaveCompleted = false;
  let pendingSaveInFlight = false;
  let productionEditedByUser = false;
  let previewWorks = [];
  let previewModels = [];
  let worksListRef = [];
  let modelsListRef = [];
  let renderWorksList = null;
  let renderModelsList = null;
  let modelIdEditedManually = false;
  let selectedModelProfileImage = null;
  let modelProfilePreviewUrl = '';
  let editingModelId = '';

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFKC')
      .trim()
      .toLowerCase()
      .replace(/[ァ-ン]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  async function fetchJson(path) {
    const resp = await fetch(path, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`${path}: HTTP ${resp.status}`);
    return resp.json();
  }

  async function fetchWorksForAdmin() {
    if (page !== 'works') {
      const works = await fetchJson('/data/works.json');
      return {
        works: Array.isArray(works) ? works : [],
        source: 'static',
        branch: ''
      };
    }

    try {
      const payload = await fetchJson('/api/admin/works-dev');
      if (payload?.success && Array.isArray(payload.works)) {
        return {
          works: payload.works,
          source: payload.source || 'github',
          branch: payload.branch || 'dev'
        };
      }
      throw new Error(payload?.error?.message || 'dev最新JSONを読み込めませんでした。');
    } catch (err) {
      console.warn('Falling back to static works JSON', err);
      const works = await fetchJson('/data/works.json');
      return {
        works: Array.isArray(works) ? works : [],
        source: 'static',
        branch: '',
        error: err
      };
    }
  }

  async function fetchModelsForAdmin() {
    if (page !== 'models') {
      const models = await fetchJson('/data/models.json');
      return {
        models: Array.isArray(models) ? models : [],
        source: 'static',
        branch: ''
      };
    }

    try {
      const payload = await fetchJson('/api/admin/models-dev');
      if (payload?.success && Array.isArray(payload.models)) {
        return {
          models: payload.models,
          source: payload.source || 'github',
          branch: payload.branch || 'dev'
        };
      }
      throw new Error(payload?.error?.message || 'dev最新models.jsonを読み込めませんでした。');
    } catch (err) {
      console.warn('Falling back to static models JSON', err);
      const models = await fetchJson('/data/models.json');
      return {
        models: Array.isArray(models) ? models : [],
        source: 'static',
        branch: '',
        error: err
      };
    }
  }

  async function readApiJsonResponse(resp) {
    const status = resp.status;
    const contentType = resp.headers.get('content-type') || '';
    const text = await resp.text();
    const trimmedText = text.trim();

    if (!trimmedText) {
      return {
        success: false,
        error: {
          code: 'invalid_response',
          message: 'APIレスポンスが空でした。',
          status,
          contentType,
          bodyPreview: ''
        }
      };
    }

    try {
      return JSON.parse(trimmedText);
    } catch {
      return {
        success: false,
        error: {
          code: 'invalid_response',
          message: 'APIレスポンスをJSONとして解析できませんでした。',
          status,
          contentType,
          bodyPreview: trimmedText.slice(0, 800)
        }
      };
    }
  }

  function getWorkModelIds(work) {
    return Array.isArray(work?.modelIds) ? work.modelIds : work?.models || [];
  }

  function toSiteImageUrl(path) {
    const value = String(path || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('/images/')) return `${siteImageBaseUrl}${value}`;
    return `${siteImageBaseUrl}/images/models/${value}`;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '-';
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  function revokePreviewUrls() {
    [originalPreviewUrl, largePreviewUrl, thumbPreviewUrl].forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });
    originalPreviewUrl = '';
    largePreviewUrl = '';
    thumbPreviewUrl = '';
    selectedOriginalFile = null;
    generatedLargeBlob = null;
    generatedThumbBlob = null;
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    });
  }

  function fitWithin(width, height, maxEdge) {
    const longest = Math.max(width, height);
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale))
    };
  }

  async function renderToBlob(image, maxEdge, quality) {
    const size = fitWithin(image.naturalWidth, image.naturalHeight, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, size.width, size.height);

    let blob = await canvasToBlob(canvas, 'image/webp', quality);
    if (!blob || blob.type !== 'image/webp') {
      blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      return { blob, ...size, extension: 'jpg', type: blob?.type || 'image/jpeg' };
    }

    return { blob, ...size, extension: 'webp', type: blob.type };
  }

  function isHeicFile(file) {
    const name = String(file?.name || '').toLowerCase();
    const type = String(file?.type || '').toLowerCase();
    return type.includes('heic') || type.includes('heif') || /\.(heic|heif)$/.test(name);
  }

  function isSupportedSourceImage(file) {
    const name = String(file?.name || '').toLowerCase();
    const type = String(file?.type || '').toLowerCase();
    return ['image/jpeg', 'image/png', 'image/webp'].includes(type)
      || /\.(jpe?g|png|webp)$/.test(name);
  }

  function isPendingSourceImage(file) {
    const name = String(file?.name || '').toLowerCase();
    const type = String(file?.type || '').toLowerCase();
    return ['image/jpeg', 'image/png'].includes(type) || /\.(jpe?g|png)$/.test(name);
  }

  function pendingExtension(file) {
    const name = String(file?.name || '').toLowerCase();
    const type = String(file?.type || '').toLowerCase();
    if (type === 'image/png' || /\.png$/.test(name)) return 'png';
    return 'jpg';
  }

  function currentSaveMode() {
    return saveModeInputs.find((input) => input.checked)?.value || 'pending';
  }

  function selectedModelIds() {
    return Array.from(previewModelIds?.querySelectorAll('input[type="checkbox"]:checked') || [])
      .map((input) => input.value);
  }

  function selectedModelNames() {
    const selected = selectedModelIds();
    return selected.map((id) => previewModels.find((model) => model.id === id)?.name || id).filter(Boolean);
  }

  function productionCandidateForModel(model) {
    return String(model?.agency || '').trim() || 'リク撮';
  }

  function applyProductionAutofill() {
    if (!previewProduction || editingWorkId) return;

    const modelIds = selectedModelIds();
    if (modelIds.length !== 1) return;

    const model = previewModels.find((item) => item.id === modelIds[0]);
    previewProduction.value = productionCandidateForModel(model);
    productionEditedByUser = false;
    updateSavePreview();
  }

  function todayRegistrationDate() {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return {
      display: `${year}-${month}-${day}`,
      prefix: `${year.slice(-2)}${month}${day}`
    };
  }

  function getModelSortValue(model, id) {
    return normalizeText(model?.nameKana || model?.name || id);
  }

  function getModelDisplayName(model) {
    return String(model?.name || model?.displayName || model?.id || '').trim();
  }

  function compareModelsByKana(a, b) {
    const idA = String(a?.id || '');
    const idB = String(b?.id || '');
    const kanaCompare = getModelSortValue(a, idA).localeCompare(getModelSortValue(b, idB), 'ja', {
      numeric: true
    });
    if (kanaCompare !== 0) return kanaCompare;

    const displayCompare = normalizeText(getModelDisplayName(a)).localeCompare(normalizeText(getModelDisplayName(b)), 'ja', {
      numeric: true
    });
    if (displayCompare !== 0) return displayCompare;

    return idA.localeCompare(idB, 'ja', { numeric: true });
  }

  function sortedModelIdsForWorkId(modelIds) {
    return [...modelIds].sort((a, b) => {
      const modelA = previewModels.find((model) => model.id === a);
      const modelB = previewModels.find((model) => model.id === b);
      const sortByName = getModelSortValue(modelA, a).localeCompare(getModelSortValue(modelB, b), 'ja');
      if (sortByName !== 0) return sortByName;
      return a.localeCompare(b);
    });
  }

  function parseWorkId(workId) {
    const match = String(workId || '').match(/^(\d{6})([A-Za-z0-9][A-Za-z0-9_-]*)_(\d{4})$/);
    if (!match) return null;
    return {
      prefix: match[1],
      modelSlug: match[2],
      sequence: Number(match[3])
    };
  }

  function sameModelSet(a, b) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((id, index) => id === sortedB[index]);
  }

  function preferredModelSlug(modelIds) {
    const existing = previewWorks
      .map((work) => ({
        id: work.id,
        modelIds: getWorkModelIds(work),
        parts: parseWorkId(work.id)
      }))
      .filter((work) => work.parts && sameModelSet(work.modelIds, modelIds))
      .sort((a, b) => {
        const keyA = `${a.parts.prefix}${String(a.parts.sequence).padStart(4, '0')}`;
        const keyB = `${b.parts.prefix}${String(b.parts.sequence).padStart(4, '0')}`;
        return keyB.localeCompare(keyA);
      });

    if (existing.length) return existing[0].parts.modelSlug;
    return sortedModelIdsForWorkId(modelIds).join('_');
  }

  function nextSequence(prefix, modelSlug) {
    const max = previewWorks.reduce((currentMax, work) => {
      const parts = parseWorkId(work.id);
      if (!parts || parts.prefix !== prefix || parts.modelSlug !== modelSlug) return currentMax;
      return Math.max(currentMax, parts.sequence);
    }, 0);
    return String(max + 1).padStart(4, '0');
  }

  function generateWorkId() {
    const modelIds = selectedModelIds();
    if (!modelIds.length) return '';

    const registrationDate = todayRegistrationDate();
    const modelSlug = preferredModelSlug(modelIds);
    const sequence = nextSequence(registrationDate.prefix, modelSlug);
    return `${registrationDate.prefix}${modelSlug}_${sequence}`;
  }

  function updateGeneratedWorkId() {
    generatedWorkId = editingWorkId || generateWorkId();
    if (registrationDateNote) {
      registrationDateNote.textContent = editingWorkId
        ? '編集中は作品IDを変更できません。'
        : `先頭YYMMDDは登録日 ${todayRegistrationDate().display} です。撮影日ではありません。`;
    }
    if (previewGeneratedWorkId) {
      previewGeneratedWorkId.textContent = generatedWorkId || (editingWorkId ? '編集中' : 'モデル選択で自動生成');
      previewGeneratedWorkId.classList.toggle('is-empty', !generatedWorkId);
    }
    if (copyGeneratedWorkId) {
      copyGeneratedWorkId.disabled = !generatedWorkId;
    }
    updateSavePreview();
  }

  function updateSavePreview() {
    if (!savePreviewSummary) return;
    const title = String(previewTitle?.value || '').trim();
    const date = String(previewDate?.value || '').trim();
    const location = String(previewLocation?.value || '').trim();
    const modelIds = selectedModelIds();
    const modelNames = selectedModelNames();

    confirmWorkId.textContent = generatedWorkId || '未生成';
    confirmTitle.textContent = title || '未入力';
    if (confirmDate) confirmDate.textContent = date || '未入力';
    confirmModels.textContent = modelNames.join('・') || '未選択';
    if (confirmModelIds) confirmModelIds.textContent = modelIds.join(', ') || '未選択';
    if (confirmOriginalFileName) confirmOriginalFileName.textContent = selectedOriginalFile?.name || '未選択';
    if (confirmOriginalMime) confirmOriginalMime.textContent = selectedOriginalFile?.type || '未選択';
    if (confirmOriginalSize) confirmOriginalSize.textContent = selectedOriginalFile ? formatBytes(selectedOriginalFile.size) : '未選択';
    if (confirmPendingPath) {
      confirmPendingPath.textContent = generatedWorkId && selectedOriginalFile
        ? `tools/admin/uploads/works/pending/${generatedWorkId}/original.${pendingExtension(selectedOriginalFile)}`
        : '未生成';
    }
    confirmLargePath.textContent = generatedWorkId ? `/images/works/large/${generatedWorkId}.webp` : '未生成';
    confirmThumbPath.textContent = generatedWorkId ? `/images/works/thumbs/${generatedWorkId}.webp` : '未生成';
    if (confirmBranch) confirmBranch.textContent = saveBranch;
    updateSaveButtonState();
  }

  function canSaveWork() {
    return Boolean(
      generatedWorkId
      && String(previewTitle?.value || '').trim()
      && String(previewDate?.value || '').trim()
      && String(previewLocation?.value || '').trim()
      && String(previewProduction?.value || '').trim()
      && selectedModelIds().length
      && generatedLargeBlob
      && generatedThumbBlob
      && generatedExtension === 'webp'
    );
  }

  function canSavePendingWork() {
    return Boolean(
      !editingWorkId
      && !pendingSaveCompleted
      && !pendingSaveInFlight
      && generatedWorkId
      && String(previewTitle?.value || '').trim()
      && String(previewDate?.value || '').trim()
      && String(previewLocation?.value || '').trim()
      && String(previewProduction?.value || '').trim()
      && selectedModelIds().length
      && selectedOriginalFile
      && isPendingSourceImage(selectedOriginalFile)
    );
  }

  function updateSaveButtonState() {
    const mode = currentSaveMode();
    if (savePendingWork) savePendingWork.disabled = Boolean(editingWorkId) || mode !== 'pending' || !canSavePendingWork();
    if (saveWorkWithImages) saveWorkWithImages.disabled = Boolean(editingWorkId) || mode !== 'webp' || !canSaveWork();
    if (saveWorkEdit) {
      saveWorkEdit.hidden = !editingWorkId;
      saveWorkEdit.disabled = !canSaveEditWork();
    }
    if (cancelWorkEdit) cancelWorkEdit.hidden = !editingWorkId;
  }

  function updateModeVisibility() {
    const mode = currentSaveMode();
    webpPreviewItems.forEach((item) => {
      item.hidden = mode === 'pending';
    });
    updateSaveButtonState();
    updateSavePreview();
  }

  function populatePreviewModels(models) {
    if (!previewModelIds) return;
    previewModels = models;
    const sortedModels = [...models].sort(compareModelsByKana);
    previewModelIds.innerHTML = sortedModels.map((model) => (
      `<label class="preview-model-chip">
        <input type="checkbox" value="${escapeHtml(model.id)}">
        <span>${escapeHtml(getModelDisplayName(model))}</span>
      </label>`
    )).join('');
  }

  function loadImageFromUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('画像を読み込めませんでした。'));
      img.src = url;
    });
  }

  async function handlePreviewImageChange() {
    if (!previewImageInput || !previewImageInput.files?.length) return;
    const file = previewImageInput.files[0];

    revokePreviewUrls();
    pendingSaveCompleted = false;
    selectedOriginalFile = file;
    if (saveApiResult) saveApiResult.hidden = true;
    hidePostSaveActions();
    previewMessage.textContent = currentSaveMode() === 'pending' ? '元画像を読み込み中です...' : '画像を生成中です...';
    previewMeta.hidden = true;
    previewImages.hidden = true;
    savePreviewSummary.hidden = true;
    updateSaveButtonState();

    try {
      if (isHeicFile(file)) {
        throw new Error('HEIC/HEIFは非対応です。iPhoneの写真をJPEG/PNG/WebPに変換してから選択してください。');
      }
      if (currentSaveMode() === 'pending' && !isPendingSourceImage(file)) {
        throw new Error('pending保存ではJPEG / PNG の画像を選択してください。');
      }
      if (currentSaveMode() === 'webp' && !isSupportedSourceImage(file)) {
        throw new Error('WebP直接保存ではJPEG / PNG / WebP の画像を選択してください。');
      }

      originalPreviewUrl = URL.createObjectURL(file);
      const originalImage = await loadImageFromUrl(originalPreviewUrl);
      previewFileName.textContent = file.name || '-';
      previewMimeType.textContent = file.type || '未取得';
      previewFileSize.textContent = formatBytes(file.size);
      previewImageSize.textContent = `${originalImage.naturalWidth} x ${originalImage.naturalHeight}px`;
      previewOriginalImage.src = originalPreviewUrl;

      if (currentSaveMode() === 'pending') {
        previewMeta.hidden = false;
        previewImages.hidden = false;
        savePreviewSummary.hidden = false;
        previewMessage.textContent = '元画像を確認しました。pending保存ではCanvas変換せず、この画像をそのままdevへ保存します。';
        updateModeVisibility();
        return;
      }

      const large = await renderToBlob(originalImage, largeMaxEdge, 0.85);
      const thumb = await renderToBlob(originalImage, thumbMaxEdge, 0.8);

      if (!large.blob || !thumb.blob) throw new Error('画像生成に失敗しました。');

      generatedExtension = large.extension === 'webp' && thumb.extension === 'webp' ? 'webp' : 'jpg';
      generatedLargeBlob = generatedExtension === 'webp' ? large.blob : null;
      generatedThumbBlob = generatedExtension === 'webp' ? thumb.blob : null;
      largePreviewUrl = URL.createObjectURL(large.blob);
      thumbPreviewUrl = URL.createObjectURL(thumb.blob);

      previewLargeImage.src = largePreviewUrl;
      previewThumbImage.src = thumbPreviewUrl;
      previewLargeMeta.textContent = `${large.width} x ${large.height}px / ${large.type} / ${formatBytes(large.blob.size)}`;
      previewThumbMeta.textContent = `${thumb.width} x ${thumb.height}px / ${thumb.type} / ${formatBytes(thumb.blob.size)}`;

      previewMeta.hidden = false;
      previewImages.hidden = false;
      savePreviewSummary.hidden = false;
      previewMessage.textContent = generatedExtension === 'webp'
        ? 'WebPでlarge/thumbを生成しました。保存前確認を確認してください。'
        : 'WebP生成に対応していないため、この画面からは保存できません。';
      updateSavePreview();
    } catch (err) {
      console.error(err);
      revokePreviewUrls();
      selectedOriginalFile = null;
      updateSaveButtonState();
      previewMessage.textContent = err.message || '画像生成に失敗しました。';
    }
  }

  function buildWorkPayload() {
    return {
      id: generatedWorkId,
      title: String(previewTitle?.value || '').trim(),
      date: String(previewDate?.value || '').trim(),
      location: String(previewLocation?.value || '').trim(),
      production: String(previewProduction?.value || '').trim(),
      caption: String(previewCaption?.value || '').trim(),
      modelIds: selectedModelIds()
    };
  }

  function buildWorkUpdatesPayload() {
    return {
      title: String(previewTitle?.value || '').trim(),
      date: String(previewDate?.value || '').trim(),
      location: String(previewLocation?.value || '').trim(),
      production: String(previewProduction?.value || '').trim(),
      caption: String(previewCaption?.value || '').trim(),
      modelIds: selectedModelIds()
    };
  }

  function canSaveEditWork() {
    return Boolean(
      editingWorkId
      && String(previewTitle?.value || '').trim()
      && String(previewDate?.value || '').trim()
      && String(previewLocation?.value || '').trim()
      && String(previewProduction?.value || '').trim()
      && selectedModelIds().length
    );
  }

  function renderSaveResult(payload, ok) {
    if (!saveApiResult) return;
    saveApiResult.hidden = false;
    saveApiResult.classList.toggle('is-error', !ok);
    saveApiResult.textContent = JSON.stringify(payload, null, 2);
  }

  function showRetryPendingSave(show) {
    if (retryPendingSave) retryPendingSave.hidden = !show;
  }

  function hidePostSaveActions() {
    if (postSaveActions) postSaveActions.hidden = true;
  }

  function renderPostSaveActions(payload) {
    if (!postSaveActions) return;
    postSaveActions.hidden = false;
    if (postSaveBranch) postSaveBranch.textContent = payload.branch || saveBranch;
    if (postSaveCommitUrl) {
      postSaveCommitUrl.innerHTML = payload.commitUrl
        ? `<a href="${escapeHtml(payload.commitUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(payload.commitUrl)}</a>`
        : '-';
    }
    if (postSavePendingFiles) {
      const files = Array.isArray(payload.pendingFiles) ? payload.pendingFiles : [];
      postSavePendingFiles.innerHTML = files.length
        ? `<ul>${files.map((filePath) => `<li>${escapeHtml(filePath)}</li>`).join('')}</ul>`
        : '-';
    }
  }

  function resetImagePreviewState() {
    revokePreviewUrls();
    if (previewImageInput) previewImageInput.value = '';
    if (previewOriginalImage) previewOriginalImage.removeAttribute('src');
    if (previewLargeImage) previewLargeImage.removeAttribute('src');
    if (previewThumbImage) previewThumbImage.removeAttribute('src');
    if (previewFileName) previewFileName.textContent = '-';
    if (previewMimeType) previewMimeType.textContent = '-';
    if (previewFileSize) previewFileSize.textContent = '-';
    if (previewImageSize) previewImageSize.textContent = '-';
    if (previewLargeMeta) previewLargeMeta.textContent = '-';
    if (previewThumbMeta) previewThumbMeta.textContent = '-';
    if (previewMeta) previewMeta.hidden = true;
    if (previewImages) previewImages.hidden = true;
  }

  function resetWorkForm({ keepContext = false } = {}) {
    const keepModelIds = keepContext ? selectedModelIds() : [];
    const keepDate = keepContext ? previewDate?.value || '' : '';
    const keepLocation = keepContext ? previewLocation?.value || '' : '';
    const keepProduction = keepContext ? previewProduction?.value || '' : '';

    editingWorkId = '';
    generatedWorkId = '';
    pendingSaveCompleted = false;
    productionEditedByUser = Boolean(keepProduction);
    if (previewTitle) previewTitle.value = '';
    if (previewDate) previewDate.value = keepDate;
    if (previewLocation) previewLocation.value = keepLocation;
    if (previewProduction) previewProduction.value = keepProduction;
    if (previewCaption) previewCaption.value = '';
    setSelectedModelIds(keepModelIds);
    resetImagePreviewState();
    if (savePreviewSummary) savePreviewSummary.hidden = true;
    if (saveApiResult) saveApiResult.hidden = true;
    showRetryPendingSave(false);
    hidePostSaveActions();
    updateGeneratedWorkId();
    updateModeVisibility();
    renderWorksList?.();
  }

  function scrollToWorksList() {
    const target = document.getElementById('works-title')?.closest('section') || list;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function scrollToModelsList() {
    const target = document.getElementById('models-title')?.closest('section') || list;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function extractSocialHandleFromUrl(value, service) {
    try {
      const parsed = new URL(value);
      const parts = parsed.pathname.split('/').map((part) => part.trim()).filter(Boolean);
      if (!parts.length) return '';
      const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
      if (service === 'x' && (host === 'x.com' || host === 'twitter.com')) return parts[0].replace(/^@/, '');
      if (service === 'instagram' && host === 'instagram.com') return parts[0].replace(/^@/, '');
      if (service === 'threads' && host === 'threads.net') return parts[0].replace(/^@/, '');
      return '';
    } catch {
      return '';
    }
  }

  function normalizeModelSocialUrl(value, service) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const urlHandle = /^https?:\/\//i.test(raw) ? extractSocialHandleFromUrl(raw, service) : '';
    const handle = (urlHandle || raw).replace(/^@/, '').replace(/\/+$/g, '').trim();
    if (!handle) return '';

    if (service === 'x') return `https://x.com/${handle}`;
    if (service === 'instagram') return `https://www.instagram.com/${handle}`;
    if (service === 'threads') return `https://www.threads.net/@${handle}`;
    return raw;
  }

  function buildModelPayload() {
    return {
      id: String(modelFormId?.value || '').trim(),
      name: String(modelFormName?.value || '').trim(),
      shortName: String(modelFormShortName?.value || '').trim(),
      yomi: String(modelFormYomi?.value || '').trim(),
      agency: String(modelFormAgency?.value || '').trim(),
      x: normalizeModelSocialUrl(modelFormX?.value, 'x'),
      instagram: normalizeModelSocialUrl(modelFormInstagram?.value, 'instagram'),
      threads: normalizeModelSocialUrl(modelFormThreads?.value, 'threads'),
      otherUrl: String(modelFormOtherUrl?.value || '').trim(),
      otherLabel: String(modelFormOtherLabel?.value || '').trim(),
      profileImage: String(modelFormProfileImage?.value || '').trim()
    };
  }

  function buildModelUpdatesPayload() {
    return {
      name: String(modelFormName?.value || '').trim(),
      shortName: String(modelFormShortName?.value || '').trim(),
      yomi: String(modelFormYomi?.value || '').trim(),
      agency: String(modelFormAgency?.value || '').trim(),
      x: normalizeModelSocialUrl(modelFormX?.value, 'x'),
      instagram: normalizeModelSocialUrl(modelFormInstagram?.value, 'instagram'),
      threads: normalizeModelSocialUrl(modelFormThreads?.value, 'threads'),
      otherUrl: String(modelFormOtherUrl?.value || '').trim(),
      otherLabel: String(modelFormOtherLabel?.value || '').trim()
    };
  }

  function formValuesFromModel(model) {
    const links = model?.links || {};
    return {
      id: String(model?.id || '').trim(),
      name: String(model?.name || '').trim(),
      shortName: String(model?.displayName || model?.shortName || '').trim(),
      yomi: String(model?.nameKana || model?.yomi || '').trim(),
      agency: String(model?.agency || '').trim(),
      x: normalizeModelSocialUrl(links.x || links.twitter || '', 'x'),
      instagram: normalizeModelSocialUrl(links.instagram || '', 'instagram'),
      threads: normalizeModelSocialUrl(links.threads || '', 'threads'),
      otherUrl: String(links.website || '').trim(),
      otherLabel: String(links.websiteLabel || '').trim(),
      profileImage: String(model?.thumbnail || model?.profileImage || '').trim()
    };
  }

  function setModelFormValues(values) {
    if (modelFormId) modelFormId.value = values.id || '';
    if (modelFormIdBase) modelFormIdBase.value = '';
    if (modelFormIdSuffix) modelFormIdSuffix.value = '';
    if (modelFormName) modelFormName.value = values.name || '';
    if (modelFormShortName) modelFormShortName.value = values.shortName || '';
    if (modelFormYomi) modelFormYomi.value = values.yomi || '';
    if (modelFormAgency) modelFormAgency.value = values.agency || '';
    if (modelFormX) modelFormX.value = values.x || '';
    if (modelFormInstagram) modelFormInstagram.value = values.instagram || '';
    if (modelFormThreads) modelFormThreads.value = values.threads || '';
    if (modelFormOtherUrl) modelFormOtherUrl.value = values.otherUrl || '';
    if (modelFormOtherLabel) modelFormOtherLabel.value = values.otherLabel || '';
    if (modelFormProfileImage) modelFormProfileImage.value = values.profileImage || '';
  }

  function generatedModelIdFromParts() {
    const base = String(modelFormIdBase?.value || '').trim();
    const suffix = String(modelFormIdSuffix?.value || '').trim();
    return suffix ? `${base}-${suffix}` : base;
  }

  function syncGeneratedModelId() {
    if (!modelFormId || modelIdEditedManually) return;
    modelFormId.value = generatedModelIdFromParts();
  }

  function modelPayloadToListModel(model) {
    const next = {
      id: model.id,
      name: model.name,
      aliases: [],
      agency: model.agency || '',
      bio: '',
      links: {
        instagram: model.instagram || '',
        x: model.x || '',
        threads: model.threads || '',
        website: model.otherUrl || '',
        websiteLabel: model.otherLabel || ''
      },
      featured: true
    };
    if (model.shortName) next.displayName = model.shortName;
    if (model.yomi) next.nameKana = model.yomi;
    if (model.profileImage) next.thumbnail = model.profileImage;
    return next;
  }

  function canSaveModel() {
    const model = buildModelPayload();
    if (editingModelId) {
      return Boolean(editingModelId && model.name);
    }
    return Boolean(
      model.id
      && isValidNewModelId(model.id)
      && model.name
      && selectedModelProfileImage
      && isPendingSourceImage(selectedModelProfileImage)
      && !modelsListRef.some((item) => item?.id === model.id)
    );
  }

  function isValidNewModelId(value) {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || ''));
  }

  function isValidModelIdBase(value) {
    return /^[a-z0-9]+$/.test(String(value || ''));
  }

  function isValidModelIdSuffix(value) {
    return !value || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || ''));
  }

  function modelIdValidationMessage(value) {
    if (!value) return 'モデルIDを入力してください。';
    if (/\s/.test(value)) return 'スペースは使えません。';
    if (/[^a-z0-9-]/.test(value)) return '使える文字は a-z, 0-9, ハイフンのみです。大文字、日本語、アンダースコアは使えません。';
    if (value.startsWith('-') || value.endsWith('-')) return '先頭と末尾にハイフンは使えません。';
    if (value.includes('--')) return '連続ハイフンは使えません。';
    if (!isValidNewModelId(value)) return 'モデルIDの形式が正しくありません。';
    return '';
  }

  function updateModelSaveState() {
    if (!saveModelDev) return;
    const model = buildModelPayload();
    const isEditingModel = Boolean(editingModelId);
    const base = String(modelFormIdBase?.value || '').trim();
    const suffix = String(modelFormIdSuffix?.value || '').trim();
    const duplicate = !isEditingModel && Boolean(model.id && modelsListRef.some((item) => item?.id === model.id));
    const idMessage = modelIdValidationMessage(model.id);
    const baseMessage = isEditingModel ? '' : !base
      ? 'モデルIDベースを入力してください。'
      : isValidModelIdBase(base)
        ? ''
        : 'モデルIDベースは a-z と 0-9 のみです。';
    const suffixMessage = isEditingModel || isValidModelIdSuffix(suffix)
      ? ''
      : '補足（所属）は a-z, 0-9, ハイフンのみです。先頭/末尾/連続ハイフンは使えません。';
    const imageMessage = isEditingModel ? '' : selectedModelProfileImage
      ? isHeicFile(selectedModelProfileImage)
        ? 'HEIC / HEIFは非対応です。JPEGまたはPNGへ変換してから選択してください。'
        : isPendingSourceImage(selectedModelProfileImage)
          ? ''
          : 'プロフィール画像はJPEGまたはPNGを選択してください。'
      : 'プロフィール画像を選択してください。';
    const nextDisabled = isEditingModel
      ? !model.name
      : Boolean(baseMessage || suffixMessage || idMessage || imageMessage) || !model.name || duplicate;
    saveModelDev.disabled = nextDisabled;
    if (saveModelImageReplace) {
      saveModelImageReplace.disabled = !isEditingModel
        || !selectedModelProfileImage
        || isHeicFile(selectedModelProfileImage)
        || !isPendingSourceImage(selectedModelProfileImage);
    }
    if (modelIdError) {
      modelIdError.textContent = isEditingModel ? '' : baseMessage || suffixMessage || idMessage;
      modelIdError.hidden = isEditingModel || !(baseMessage || suffixMessage || idMessage);
    }
    if (modelFormMessage) {
      if (isEditingModel && !model.name) {
        modelFormMessage.textContent = '名前を入力してください。';
      } else if (isEditingModel) {
        modelFormMessage.textContent = selectedModelProfileImage
          ? '保存前プレビューを確認し、画像だけ差し替える場合は「プロフィール画像を差し替え」を押してください。'
          : '編集内容をdevブランチへ保存できます。プロフィール画像も差し替えできます。';
      } else if (duplicate) {
        modelFormMessage.textContent = `同じモデルIDが既に存在します: ${model.id}`;
      } else if (baseMessage || suffixMessage || idMessage) {
        modelFormMessage.textContent = baseMessage || suffixMessage || idMessage;
      } else if (!model.id || !model.name) {
        modelFormMessage.textContent = 'モデルIDと名前を入力してください。';
      } else if (imageMessage) {
        modelFormMessage.textContent = imageMessage;
      } else {
        modelFormMessage.textContent = 'プロフィール画像付きでpending保存できます。';
      }
    }
  }

  function renderModelSaveResult(payload, ok) {
    if (!modelSaveResult) return;
    modelSaveResult.hidden = false;
    modelSaveResult.classList.toggle('is-error', !ok);
    modelSaveResult.textContent = JSON.stringify(payload, null, 2);
  }

  function clearModelProfilePreview() {
    if (modelProfilePreviewUrl) URL.revokeObjectURL(modelProfilePreviewUrl);
    modelProfilePreviewUrl = '';
    if (modelProfilePreview) modelProfilePreview.hidden = true;
    if (modelProfilePreviewImage) modelProfilePreviewImage.removeAttribute('src');
    if (modelProfileFileName) modelProfileFileName.textContent = '-';
    if (modelProfileMimeType) modelProfileMimeType.textContent = '-';
    if (modelProfileFileSize) modelProfileFileSize.textContent = '-';
  }

  function renderModelProfilePreview(file) {
    clearModelProfilePreview();
    if (!file || !modelProfilePreview || !modelProfilePreviewImage) return;

    modelProfilePreviewUrl = URL.createObjectURL(file);
    modelProfilePreviewImage.src = modelProfilePreviewUrl;
    if (modelProfileFileName) modelProfileFileName.textContent = file.name || '-';
    if (modelProfileMimeType) modelProfileMimeType.textContent = file.type || '-';
    if (modelProfileFileSize) modelProfileFileSize.textContent = formatBytes(file.size);
    modelProfilePreview.hidden = false;
  }

  function hideModelPostSaveActions() {
    if (modelPostSaveActions) modelPostSaveActions.hidden = true;
  }

  function renderModelPostSaveActions(payload) {
    if (!modelPostSaveActions) return;
    modelPostSaveActions.hidden = false;
    const checklist = modelPostSaveActions.querySelector('.post-save-checklist');
    if (checklist) {
      checklist.innerHTML = `
        <li>pending保存済み</li>
        <li><span id="modelPostSaveBranch">${escapeHtml(payload.branch || saveBranch)}</span>へ保存済み</li>
        <li>GitHub Actionsで変換待ち</li>
      `;
    }
    if (modelPostSaveBranch) modelPostSaveBranch.textContent = payload.branch || saveBranch;
    if (modelPostSaveCommitUrl) {
      modelPostSaveCommitUrl.innerHTML = payload.commitUrl
        ? `<a href="${escapeHtml(payload.commitUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(payload.commitUrl)}</a>`
        : '-';
    }
    if (modelPostSaveFiles) {
      const files = Array.isArray(payload.pendingFiles) ? payload.pendingFiles : [];
      modelPostSaveFiles.innerHTML = files.length
        ? `<ul>${files.map((filePath) => `<li>${escapeHtml(filePath)}</li>`).join('')}</ul>`
        : '-';
    }
  }

  function clearModelRegisterForm({ keepResult = false } = {}) {
    [
      modelFormId,
      modelFormIdBase,
      modelFormIdSuffix,
      modelFormName,
      modelFormShortName,
      modelFormYomi,
      modelFormAgency,
      modelProfileImageInput,
      modelFormProfileImage,
      modelFormX,
      modelFormInstagram,
      modelFormThreads,
      modelFormOtherUrl,
      modelFormOtherLabel
    ].forEach((input) => {
      if (input) input.value = '';
    });
    if (!keepResult && modelSaveResult) modelSaveResult.hidden = true;
    if (!keepResult) hideModelPostSaveActions();
    modelIdEditedManually = false;
    selectedModelProfileImage = null;
    clearModelProfilePreview();
    if (!editingModelId) updateModelEditUi();
    updateModelSaveState();
  }

  function updateModelEditUi() {
    const isEditingModel = Boolean(editingModelId);
    const editableIdFields = [modelFormIdBase, modelFormIdSuffix, modelFormId];
    editableIdFields.forEach((input) => {
      if (input) input.disabled = isEditingModel;
    });
    if (modelProfileImageField) modelProfileImageField.hidden = false;
    if (modelProfileAdvancedOption) modelProfileAdvancedOption.hidden = isEditingModel;
    if (cancelModelEdit) cancelModelEdit.hidden = !isEditingModel;
    if (saveModelImageReplace) saveModelImageReplace.hidden = !isEditingModel;
    if (saveModelDev) saveModelDev.textContent = isEditingModel ? '編集を保存' : 'pendingへモデル保存';
    if (modelEditNotice) {
      modelEditNotice.hidden = !isEditingModel;
      modelEditNotice.textContent = isEditingModel
        ? `編集中: ${editingModelId}。idは変更できません。プロフィール画像を差し替える場合は新しい画像を選択し、「プロフィール画像を差し替え」を押してください。`
        : '';
    }
    renderCurrentModelProfileImage();
  }

  function renderCurrentModelProfileImage() {
    if (!modelCurrentProfileImage) return;
    const model = modelsListRef.find((item) => item?.id === editingModelId);
    const image = model ? toSiteImageUrl(model.thumbnail || model.profileImage || '') : '';
    modelCurrentProfileImage.hidden = !editingModelId || !image;
    if (modelCurrentProfileImageThumb) {
      if (image) {
        modelCurrentProfileImageThumb.src = image;
      } else {
        modelCurrentProfileImageThumb.removeAttribute('src');
      }
    }
    if (modelCurrentProfileImagePath) {
      modelCurrentProfileImagePath.textContent = model?.thumbnail || model?.profileImage || '';
    }
  }

  function enterModelEditMode(modelId) {
    if (editingModelId === modelId) {
      if (modelFormMessage) modelFormMessage.textContent = 'このモデルを編集中です。フォームへ戻りました。';
      document.querySelector('.model-register-tool')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      modelFormName?.focus({ preventScroll: true });
      return;
    }

    const model = modelsListRef.find((item) => item?.id === modelId);
    if (!model) {
      if (modelFormMessage) modelFormMessage.textContent = `編集対象が見つかりません: ${modelId}`;
      return;
    }

    editingModelId = model.id;
    modelIdEditedManually = true;
    selectedModelProfileImage = null;
    clearModelProfilePreview();
    setModelFormValues(formValuesFromModel(model));
    if (modelProfileImageInput) modelProfileImageInput.value = '';
    if (modelSaveResult) modelSaveResult.hidden = true;
    hideModelPostSaveActions();
    updateModelEditUi();
    updateModelSaveState();
    if (modelFormMessage) modelFormMessage.textContent = 'モデル情報を編集中です。idと画像は変更できません。';
    renderModelsList?.();
    document.querySelector('.model-register-tool')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    modelFormName?.focus({ preventScroll: true });
  }

  function exitModelEditMode({ keepMessage = false } = {}) {
    editingModelId = '';
    clearModelRegisterForm({ keepResult: false });
    updateModelEditUi();
    renderModelsList?.();
    if (!keepMessage && modelFormMessage) modelFormMessage.textContent = '編集をキャンセルしました。';
  }

  function updateModelInMemory(modelId, updates) {
    modelsListRef = modelsListRef.map((model) => {
      if (model?.id !== modelId) return model;
      const links = {
        ...(model.links || {}),
        instagram: updates.instagram,
        x: updates.x,
        threads: updates.threads,
        website: updates.otherUrl,
        websiteLabel: updates.otherLabel
      };
      return {
        ...model,
        name: updates.name,
        displayName: updates.shortName,
        nameKana: updates.yomi,
        agency: updates.agency,
        links
      };
    });
    previewModels = previewModels.map((model) => (model?.id === modelId
      ? modelsListRef.find((item) => item.id === modelId) || model
      : model));
    renderModelsList?.();
  }

  function userMessageForModelApiError(error) {
    const code = error?.code || '';
    const messages = {
      duplicate_model_id: '同じモデルIDが既に存在します。',
      pending_model_exists: '同じモデルIDのpendingデータが既にあります。直前の保存が成功している可能性があります。GitHub Actionsを確認してください。',
      pending_model_image_replace_exists: '同じモデルのプロフィール画像差し替えpendingが既にあります。GitHub Actionsを確認してください。',
      model_not_found: '編集対象のモデルが見つかりません。画面を再読み込みしてください。',
      missing_required_fields: 'モデルIDと名前を入力してください。',
      invalid_model_id: 'モデルIDは a-z, 0-9, ハイフンで入力してください。',
      unsupported_image_type: 'プロフィール画像はJPEGまたはPNGを選択してください。',
      missing_original_image: 'プロフィール画像を選択してください。',
      original_image_too_large: 'プロフィール画像のサイズが30MBを超えています。',
      branch_conflict: 'GitHub上のdevブランチが更新されています。画面を再読み込みしてから再実行してください。',
      invalid_response: 'APIレスポンスをJSONとして確認できませんでした。詳細を確認してください。'
    };
    return messages[code] || error?.message || 'モデル保存に失敗しました。';
  }

  async function saveModelEditToDev() {
    if (!saveModelDev || !editingModelId || !canSaveModel()) {
      updateModelSaveState();
      return;
    }

    const updates = buildModelUpdatesPayload();
    saveModelDev.disabled = true;
    saveModelDev.textContent = '編集保存中...';
    if (modelSaveResult) modelSaveResult.hidden = true;
    hideModelPostSaveActions();
    if (modelFormMessage) modelFormMessage.textContent = 'devブランチへモデル編集を保存中です...';
    let saveSucceeded = false;

    try {
      const resp = await fetch('/api/admin/models', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          id: editingModelId,
          updates
        })
      });
      const json = await readApiJsonResponse(resp);
      renderModelSaveResult(json, resp.ok && json.success);
      if (!resp.ok || !json.success) {
        if (modelFormMessage) modelFormMessage.textContent = userMessageForModelApiError(json.error);
        return;
      }

      const savedModelId = editingModelId;
      updateModelInMemory(savedModelId, updates);
      editingModelId = '';
      updateModelEditUi();
      renderModelsList?.();
      if (modelFormMessage) {
        modelFormMessage.textContent = `devへ編集を保存しました。本番反映はまだです。branch: ${json.branch || saveBranch} / modelId: ${json.modelId || savedModelId}`;
      }
      const checklist = modelPostSaveActions?.querySelector('.post-save-checklist');
      if (checklist) {
        checklist.innerHTML = `
          <li>devへ編集保存済み</li>
          <li>本番反映はまだです</li>
        `;
      }
      if (modelPostSaveCommitUrl) {
        modelPostSaveCommitUrl.innerHTML = json.commitUrl
          ? `<a href="${escapeHtml(json.commitUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(json.commitUrl)}</a>`
          : '-';
      }
      if (modelPostSaveFiles) {
        const files = Array.isArray(json.updatedFiles) ? json.updatedFiles : [];
        modelPostSaveFiles.innerHTML = files.length
          ? `<ul>${files.map((filePath) => `<li>${escapeHtml(filePath)}</li>`).join('')}</ul>`
          : '-';
      }
      if (modelPostSaveActions) modelPostSaveActions.hidden = false;
      modelPostSaveActions?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      saveSucceeded = true;
    } catch (err) {
      console.error(err);
      const payload = {
        success: false,
        error: {
          code: 'request_failed',
          message: err.message || 'モデル編集保存リクエストに失敗しました。'
        }
      };
      renderModelSaveResult(payload, false);
      if (modelFormMessage) modelFormMessage.textContent = payload.error.message;
    } finally {
      if (saveModelDev) saveModelDev.textContent = editingModelId ? '編集を保存' : 'pendingへモデル保存';
      if (!saveSucceeded) updateModelSaveState();
    }
  }

  async function saveModelImageReplacePending() {
    if (!saveModelImageReplace || !editingModelId || !selectedModelProfileImage) {
      updateModelSaveState();
      return;
    }
    if (isHeicFile(selectedModelProfileImage) || !isPendingSourceImage(selectedModelProfileImage)) {
      if (modelFormMessage) modelFormMessage.textContent = '新しい画像はJPEGまたはPNGを選択してください。HEIC / HEIFは非対応です。';
      updateModelSaveState();
      return;
    }

    const form = new FormData();
    form.append('model', JSON.stringify({ id: editingModelId }));
    form.append('original', selectedModelProfileImage, selectedModelProfileImage.name || `original.${pendingExtension(selectedModelProfileImage)}`);

    saveModelImageReplace.disabled = true;
    saveModelImageReplace.textContent = '差し替え保存中...';
    if (modelSaveResult) modelSaveResult.hidden = true;
    hideModelPostSaveActions();
    if (modelFormMessage) modelFormMessage.textContent = 'プロフィール画像の差し替えをpendingへ保存中です...';

    try {
      const resp = await fetch('/api/admin/model-image-replace-pending', {
        method: 'POST',
        body: form
      });
      const json = await readApiJsonResponse(resp);
      renderModelSaveResult(json, resp.ok && json.success);
      if (!resp.ok || !json.success) {
        if (modelFormMessage) modelFormMessage.textContent = userMessageForModelApiError(json.error);
        return;
      }

      renderModelPostSaveActions({
        ...json,
        pendingFiles: json.pendingFiles || []
      });
      if (modelFormMessage) {
        modelFormMessage.textContent = `プロフィール画像の差し替えを登録予約しました。branch: ${json.branch || saveBranch} / modelId: ${json.modelId || editingModelId}`;
      }
      if (modelProfileImageInput) modelProfileImageInput.value = '';
      selectedModelProfileImage = null;
      clearModelProfilePreview();
      modelPostSaveActions?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error(err);
      const payload = {
        success: false,
        error: {
          code: 'request_failed',
          message: err.message || 'プロフィール画像差し替えリクエストに失敗しました。'
        }
      };
      renderModelSaveResult(payload, false);
      if (modelFormMessage) modelFormMessage.textContent = payload.error.message;
    } finally {
      saveModelImageReplace.textContent = 'プロフィール画像を差し替え';
      updateModelSaveState();
    }
  }

  async function saveModelToDev() {
    if (editingModelId) {
      await saveModelEditToDev();
      return;
    }

    if (!saveModelDev || !canSaveModel()) {
      updateModelSaveState();
      return;
    }

    const model = buildModelPayload();
    const pendingModel = { ...model };
    delete pendingModel.profileImage;
    const form = new FormData();
    form.append('model', JSON.stringify(pendingModel));
    form.append('original', selectedModelProfileImage, selectedModelProfileImage.name || `original.${pendingExtension(selectedModelProfileImage)}`);

    saveModelDev.disabled = true;
    saveModelDev.textContent = '保存中...';
    if (modelSaveResult) modelSaveResult.hidden = true;
    hideModelPostSaveActions();
    if (modelFormMessage) modelFormMessage.textContent = 'devブランチのpendingへモデルを保存中です...';

    try {
      const resp = await fetch('/api/admin/models-upload-pending', {
        method: 'POST',
        body: form
      });
      const json = await readApiJsonResponse(resp);
      renderModelSaveResult(json, resp.ok && json.success);
      if (!resp.ok || !json.success) {
        if (modelFormMessage) modelFormMessage.textContent = userMessageForModelApiError(json.error);
        return;
      }

      renderModelPostSaveActions(json);
      if (modelFormMessage) {
        modelFormMessage.textContent = `登録予約完了。pending保存済みです。branch: ${json.branch || saveBranch} / modelId: ${json.modelId || pendingModel.id}`;
      }
      modelPostSaveActions?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error(err);
      const payload = {
        success: false,
        error: {
          code: 'request_failed',
          message: err.message || 'モデル保存リクエストに失敗しました。'
        }
      };
      renderModelSaveResult(payload, false);
      if (modelFormMessage) modelFormMessage.textContent = payload.error.message;
    } finally {
      saveModelDev.textContent = 'pendingへモデル保存';
      updateModelSaveState();
    }
  }

  function userMessageForApiError(error) {
    const code = error?.code || '';
    const messages = {
      duplicate_work_id: '同じ作品IDが既に存在します。作品一覧を再読み込みしてIDを確認してください。',
      pending_work_exists: '同じ作品IDのpendingデータが既にあります。直前の保存が成功している可能性があります。GitHub Actionsを確認してください。',
      image_file_exists: '保存予定の画像ファイルが既に存在します。',
      unsupported_image_type: '画像形式が対応していません。JPEGまたはPNGを選択してください。',
      original_image_too_large: '元画像のサイズが30MBを超えています。',
      invalid_large_image_type: 'large画像はWebPのみ保存できます。',
      invalid_thumb_image_type: 'thumb画像はWebPのみ保存できます。',
      branch_conflict: 'GitHub上のdevブランチが更新されています。画面を再読み込みしてから再実行してください。',
      missing_required_fields: '必須項目が不足しています。タイトル、撮影日、撮影地、モデル、画像を確認してください。',
      invalid_work_id: '作品IDの形式が不正です。',
      invalid_response: 'APIレスポンスをJSONとして確認できませんでした。詳細を確認し、必要ならもう一度試してください。'
    };
    return messages[code] || error?.message || '保存に失敗しました。';
  }

  async function savePendingWorkToGitHub() {
    if (!savePendingWork || !canSavePendingWork()) {
      previewMessage.textContent = 'pending保存に必要な項目が不足しています。';
      updateSaveButtonState();
      return;
    }

    const work = buildWorkPayload();
    const form = new FormData();
    form.append('work', JSON.stringify(work));
    form.append('original', selectedOriginalFile, selectedOriginalFile.name || `original.${pendingExtension(selectedOriginalFile)}`);

    savePendingWork.disabled = true;
    savePendingWork.textContent = 'pending保存中...';
    pendingSaveInFlight = true;
    previewMessage.textContent = 'devブランチのpendingへ保存中です...';
    if (saveApiResult) saveApiResult.hidden = true;
    showRetryPendingSave(false);
    hidePostSaveActions();

    try {
      const resp = await fetch('/api/admin/works-upload-pending', {
        method: 'POST',
        body: form
      });
      const json = await readApiJsonResponse(resp);

      renderSaveResult(json, resp.ok && json.success);
      if (!resp.ok || !json.success) {
        previewMessage.textContent = userMessageForApiError(json.error);
        showRetryPendingSave(json.error?.code === 'invalid_response');
        return;
      }

      previewWorks = [...previewWorks, work];
      pendingSaveCompleted = true;
      previewMessage.textContent = `登録予約完了。pending保存済みです。branch: ${json.branch || saveBranch} / workId: ${json.workId || work.id}`;
      renderPostSaveActions(json);
      postSaveActions?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error(err);
      const payload = {
        success: false,
        error: {
          code: 'request_failed',
          message: err.message || 'pending保存リクエストに失敗しました。'
        }
      };
      renderSaveResult(payload, false);
      showRetryPendingSave(true);
      previewMessage.textContent = payload.error.message;
    } finally {
      pendingSaveInFlight = false;
      savePendingWork.textContent = 'pendingへ保存';
      updateSaveButtonState();
    }
  }

  async function saveWorkEditToGitHub() {
    if (!editingWorkId || !canSaveEditWork()) {
      previewMessage.textContent = '編集保存に必要な項目が不足しています。';
      updateSaveButtonState();
      return;
    }

    const updates = buildWorkUpdatesPayload();
    saveWorkEdit.disabled = true;
    saveWorkEdit.textContent = '編集保存中...';
    previewMessage.textContent = 'devブランチへ編集内容を保存中です...';
    if (saveApiResult) saveApiResult.hidden = true;
    hidePostSaveActions();

    try {
      const resp = await fetch('/api/admin/works-with-images', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          id: editingWorkId,
          updates
        })
      });
      const json = await readApiJsonResponse(resp);

      renderSaveResult(json, resp.ok && json.success);
      if (!resp.ok || !json.success) {
        previewMessage.textContent = userMessageForApiError(json.error);
        return;
      }

      updateWorkInMemory(editingWorkId, updates);
      previewMessage.textContent = `devへ編集を保存しました。本番反映はまだです。branch: ${json.branch || saveBranch} / workId: ${json.updatedWorkId || editingWorkId}`;
      exitEditMode({ keepMessage: true });
      renderWorksList?.();
    } catch (err) {
      console.error(err);
      const payload = {
        success: false,
        error: {
          code: 'request_failed',
          message: err.message || '編集保存リクエストに失敗しました。'
        }
      };
      renderSaveResult(payload, false);
      previewMessage.textContent = payload.error.message;
    } finally {
      if (saveWorkEdit) saveWorkEdit.textContent = '編集を保存';
      updateSaveButtonState();
    }
  }

  async function saveWorkWithImagesToGitHub() {
    if (!saveWorkWithImages || !canSaveWork()) {
      previewMessage.textContent = '保存に必要な項目が不足しています。';
      updateSaveButtonState();
      return;
    }

    const work = buildWorkPayload();
    const form = new FormData();
    form.append('work', JSON.stringify(work));
    form.append('large', generatedLargeBlob, `${work.id}.webp`);
    form.append('thumb', generatedThumbBlob, `${work.id}.webp`);

    saveWorkWithImages.disabled = true;
    saveWorkWithImages.textContent = '保存中...';
    previewMessage.textContent = 'devブランチへ保存中です...';
    if (saveApiResult) saveApiResult.hidden = true;
    hidePostSaveActions();

    try {
      const resp = await fetch('/api/admin/works-with-images', {
        method: 'POST',
        body: form
      });
      const json = await readApiJsonResponse(resp);

      renderSaveResult(json, resp.ok && json.success);
      if (!resp.ok || !json.success) {
        previewMessage.textContent = userMessageForApiError(json.error);
        return;
      }

      previewWorks = [...previewWorks, {
        ...work,
        image: `/images/works/large/${work.id}.webp`,
        thumbnail: `/images/works/thumbs/${work.id}.webp`
      }];
      worksListRef = [...worksListRef, {
        ...work,
        image: `/images/works/large/${work.id}.webp`,
        thumbnail: `/images/works/thumbs/${work.id}.webp`
      }];
      previewMessage.textContent = `devへ保存しました。本番反映はまだです。branch: ${json.branch || saveBranch} / workId: ${json.workId || work.id}`;
      updateGeneratedWorkId();
      renderWorksList?.();
    } catch (err) {
      console.error(err);
      const payload = {
        success: false,
        error: {
          code: 'request_failed',
          message: err.message || '保存リクエストに失敗しました。'
        }
      };
      renderSaveResult(payload, false);
      previewMessage.textContent = payload.error.message;
    } finally {
      saveWorkWithImages.textContent = 'devへ保存';
      updateSaveButtonState();
    }
  }

  function setSelectedModelIds(modelIds) {
    const selected = new Set(Array.isArray(modelIds) ? modelIds : []);
    Array.from(previewModelIds?.querySelectorAll('input[type="checkbox"]') || []).forEach((input) => {
      input.checked = selected.has(input.value);
    });
  }

  function focusEditForm() {
    const target = document.querySelector('.image-preview-tool') || savePreviewSummary;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      previewTitle?.focus({ preventScroll: true });
    }, 250);
  }

  function beginEditWork(workId) {
    if (editingWorkId === workId) {
      previewMessage.textContent = 'この作品を編集中です。フォームへ戻りました。';
      focusEditForm();
      return;
    }

    const work = previewWorks.find((item) => item?.id === workId);
    if (!work) {
      previewMessage.textContent = `編集対象が見つかりません: ${workId}`;
      return;
    }

    editingWorkId = work.id;
    generatedWorkId = work.id;
    previewTitle.value = work.title || '';
    previewDate.value = work.date || '';
    previewLocation.value = work.location || '';
    previewProduction.value = work.production || '';
    productionEditedByUser = Boolean(work.production);
    previewCaption.value = work.caption || '';
    setSelectedModelIds(getWorkModelIds(work));
    savePreviewSummary.hidden = false;
    if (saveApiResult) saveApiResult.hidden = true;
    previewMessage.textContent = '作品情報を編集中です。id、image、thumbnailは変更できません。';
    updateGeneratedWorkId();
    updateModeVisibility();
    renderWorksList?.();
    focusEditForm();
  }

  function exitEditMode({ keepMessage = false } = {}) {
    editingWorkId = '';
    generatedWorkId = '';
    if (!keepMessage) previewMessage.textContent = '編集をキャンセルしました。';
    updateGeneratedWorkId();
    updateModeVisibility();
    renderWorksList?.();
  }

  function updateWorkInMemory(workId, updates) {
    const update = (work) => (
      work?.id === workId
        ? {
          ...work,
          ...updates,
          id: work.id,
          image: work.image,
          thumbnail: work.thumbnail
        }
        : work
    );
    previewWorks = previewWorks.map(update);
    worksListRef = worksListRef.map(update);
  }

  async function deleteWorkWithImagesFromGitHub(workId) {
    const work = previewWorks.find((item) => item?.id === workId);
    const title = work?.title || workId;
    const ok = window.confirm(`作品「${title}」を削除します。\n\n対象ID: ${workId}\n\nworks.jsonと画像2枚をdevブランチから削除します。よろしいですか？`);
    if (!ok) return;

    previewMessage.textContent = 'devブランチから削除中です...';
    if (saveApiResult) saveApiResult.hidden = true;

    try {
      const resp = await fetch('/api/admin/works-with-images', {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ id: workId })
      });
      const json = await readApiJsonResponse(resp);

      renderSaveResult(json, resp.ok && json.success);
      if (!resp.ok || !json.success) {
        previewMessage.textContent = userMessageForApiError(json.error);
        return;
      }

      previewWorks = previewWorks.filter((item) => item?.id !== workId);
      worksListRef = worksListRef.filter((item) => item?.id !== workId);
      if (editingWorkId === workId) exitEditMode({ keepMessage: true });
      renderWorksList?.();
      previewMessage.textContent = `削除しました。branch: ${json.branch || saveBranch} / workId: ${json.deletedWorkId || workId}`;
    } catch (err) {
      console.error(err);
      const payload = {
        success: false,
        error: {
          code: 'request_failed',
          message: err.message || '削除リクエストに失敗しました。'
        }
      };
      renderSaveResult(payload, false);
      previewMessage.textContent = payload.error.message;
    }
  }

  async function copyWorkId() {
    if (!generatedWorkId) return;
    try {
      await navigator.clipboard.writeText(generatedWorkId);
      previewMessage.textContent = '作品IDをコピーしました。';
    } catch {
      previewMessage.textContent = 'コピーできませんでした。作品IDを長押ししてコピーしてください。';
    }
  }

  function initImagePreviewTool(models, works) {
    if (!previewImageInput) return;
    // Phase A/Bでは静的JSONを参照します。保存実装時はGitHub正本API参照へ切り替える予定です。
    previewWorks = works;
    populatePreviewModels(models);
    previewImageInput.addEventListener('change', handlePreviewImageChange);
    [previewTitle, previewDate, previewLocation, previewProduction, previewCaption].forEach((input) => {
      input?.addEventListener('input', updateSavePreview);
      input?.addEventListener('change', updateSavePreview);
    });
    previewProduction?.addEventListener('input', () => {
      productionEditedByUser = true;
    });
    previewModelIds?.addEventListener('change', () => {
      applyProductionAutofill();
      updateGeneratedWorkId();
    });
    copyGeneratedWorkId?.addEventListener('click', copyWorkId);
    saveModeInputs.forEach((input) => {
      input.addEventListener('change', () => {
        updateModeVisibility();
        if (selectedOriginalFile) handlePreviewImageChange();
      });
    });
    savePendingWork?.addEventListener('click', savePendingWorkToGitHub);
    saveWorkWithImages?.addEventListener('click', saveWorkWithImagesToGitHub);
    saveWorkEdit?.addEventListener('click', saveWorkEditToGitHub);
    cancelWorkEdit?.addEventListener('click', () => exitEditMode());
    retryPendingSave?.addEventListener('click', savePendingWorkToGitHub);
    continueSameModelWork?.addEventListener('click', () => {
      resetWorkForm({ keepContext: true });
      previewMessage.textContent = '同じモデルで続けて登録できます。次のタイトルと画像を選択してください。';
      previewTitle?.focus({ preventScroll: true });
      document.querySelector('.image-preview-tool')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    clearNextWork?.addEventListener('click', () => {
      resetWorkForm();
      previewMessage.textContent = 'フォームを空にしました。';
      document.querySelector('.image-preview-tool')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    goWorksList?.addEventListener('click', scrollToWorksList);
    openGitHubActions?.addEventListener('click', () => {
      window.open(githubActionsUrl, '_blank', 'noopener,noreferrer');
    });
    updateGeneratedWorkId();
    updateModeVisibility();
  }

  function socialLinks(model) {
    const links = model.links || {};
    return [
      ['Instagram', normalizeModelSocialUrl(links.instagram, 'instagram')],
      ['X', normalizeModelSocialUrl(links.x || links.twitter, 'x')],
      ['Threads', normalizeModelSocialUrl(links.threads, 'threads')],
      [links.websiteLabel || 'Website', links.website]
    ].filter(([, url]) => url);
  }

  function renderWorks(works, models, meta = {}) {
    worksListRef = [...works];
    const modelById = new Map(models.map((model) => [model.id, model]));

    function namesFor(work) {
      return getWorkModelIds(work).map((id) => modelById.get(id)?.name || id).filter(Boolean);
    }

    function render() {
      const query = normalizeText(search.value);
      const visible = worksListRef.filter((work) => {
        const text = normalizeText([
          work.id,
          work.title,
          work.date,
          work.location,
          work.production,
          ...getWorkModelIds(work),
          ...namesFor(work)
        ].join(' '));
        return !query || text.includes(query);
      });

      list.innerHTML = visible.map((work) => {
        const thumb = toSiteImageUrl(work.thumbnail || work.image || '');
        const names = namesFor(work).join('・') || 'モデル未設定';
        const isEditing = editingWorkId === work.id;
        return `
          <article class="static-list-card${isEditing ? ' is-editing' : ''}">
            <div class="static-list-thumb">${thumb ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(work.title || work.id)}" loading="lazy">` : ''}</div>
            <div class="static-list-body">
              <h3>${escapeHtml(work.title || '(無題)')}</h3>
              ${isEditing ? '<p class="static-list-status">編集中</p>' : ''}
              <p>${escapeHtml(names)} / ${escapeHtml(work.date || '日付未設定')}</p>
              <p>${escapeHtml(work.location || '撮影地未設定')} / ${escapeHtml(work.production || 'Production未設定')}</p>
              <small>ID: ${escapeHtml(work.id)}</small>
              <div class="static-list-actions">
                <button class="${isEditing ? 'is-editing' : ''}" type="button" data-edit-work-id="${escapeHtml(work.id)}">${isEditing ? '編集中のフォームへ戻る' : '編集'}</button>
                <button class="is-danger" type="button" data-delete-work-id="${escapeHtml(work.id)}">削除</button>
              </div>
            </div>
          </article>
        `;
      }).join('') || '<p class="note">一致する作品がありません。</p>';
    }

    renderWorksList = render;
    list.addEventListener('click', (event) => {
      const editButton = event.target.closest('[data-edit-work-id]');
      if (editButton) {
        beginEditWork(editButton.dataset.editWorkId);
        return;
      }

      const deleteButton = event.target.closest('[data-delete-work-id]');
      if (deleteButton) {
        deleteWorkWithImagesFromGitHub(deleteButton.dataset.deleteWorkId);
      }
    });
    search.addEventListener('input', render);
    render();
    if (meta.source === 'github') {
      message.textContent = `${worksListRef.length}件の作品をdev最新JSONから表示しています。source: github / branch: ${meta.branch || 'dev'}`;
    } else {
      message.textContent = `${worksListRef.length}件の作品を静的JSONから表示しています。source: static / dev最新JSONを読めない場合のフォールバックです。`;
    }
  }

  function renderModels(models, works, meta = {}) {
    modelsListRef = [...models];
    const workCountByModelId = new Map();
    works.forEach((work) => {
      getWorkModelIds(work).forEach((id) => {
        workCountByModelId.set(id, (workCountByModelId.get(id) || 0) + 1);
      });
    });

    function render() {
      const query = normalizeText(search.value);
      const visible = modelsListRef.filter((model) => {
        const linkText = socialLinks(model).map(([, url]) => url).join(' ');
        const text = normalizeText([
          model.id,
          model.name,
          model.displayName,
          model.nameKana,
          model.agency,
          linkText,
          ...(Array.isArray(model.aliases) ? model.aliases : [])
        ].join(' '));
        return !query || text.includes(query);
      });

      list.innerHTML = visible.map((model) => {
        const image = toSiteImageUrl(model.thumbnail || model.profileImage || '');
        const links = socialLinks(model).map(([label, url]) => (
          `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
        )).join(' / ') || 'SNS未設定';
        const isEditing = editingModelId === model.id;
        return `
          <article class="static-list-card${isEditing ? ' is-editing' : ''}">
            <div class="static-list-thumb static-list-profile">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(model.name || model.id)}" loading="lazy">` : ''}</div>
            <div class="static-list-body">
              <h3>${escapeHtml(model.displayName || model.name || model.id)}</h3>
              ${isEditing ? '<p class="static-list-status">編集中</p>' : ''}
              <p>${escapeHtml(model.agency || '所属未設定')} / ${workCountByModelId.get(model.id) || 0} works</p>
              <p>${links}</p>
              <small>ID: ${escapeHtml(model.id)}</small>
              <div class="static-list-actions">
                <button class="${isEditing ? 'is-editing' : ''}" type="button" data-edit-model-id="${escapeHtml(model.id)}">${isEditing ? '編集中のフォームへ戻る' : '編集'}</button>
              </div>
            </div>
          </article>
        `;
      }).join('') || '<p class="note">一致するモデルがありません。</p>';
    }

    renderModelsList = render;
    list.addEventListener('click', (event) => {
      const editButton = event.target.closest('[data-edit-model-id]');
      if (editButton) enterModelEditMode(editButton.dataset.editModelId);
    });
    search.addEventListener('input', render);
    render();
    if (meta.source === 'github') {
      message.textContent = `${modelsListRef.length}件のモデルをdev最新JSONから表示しています。source: github / branch: ${meta.branch || 'dev'}`;
    } else {
      message.textContent = `${modelsListRef.length}件のモデルを静的JSONから表示しています。source: static / dev最新JSONを読めない場合のフォールバックです。`;
    }
  }

  function initModelRegisterTool(models) {
    if (!saveModelDev) return;
    modelsListRef = [...models];
    [
      modelFormIdBase,
      modelFormIdSuffix,
      modelFormId,
      modelFormName,
      modelFormShortName,
      modelFormYomi,
      modelFormAgency,
      modelFormProfileImage,
      modelFormX,
      modelFormInstagram,
      modelFormThreads,
      modelFormOtherUrl,
      modelFormOtherLabel
    ].forEach((input) => {
      input?.addEventListener('input', () => {
        if (input === modelFormIdBase || input === modelFormIdSuffix) {
          syncGeneratedModelId();
        }
        if (input === modelFormId) {
          modelIdEditedManually = true;
        }
        if (modelSaveResult) modelSaveResult.hidden = true;
        hideModelPostSaveActions();
        updateModelSaveState();
      });
    });
    modelProfileImageInput?.addEventListener('change', () => {
      selectedModelProfileImage = modelProfileImageInput.files?.[0] || null;
      renderModelProfilePreview(selectedModelProfileImage);
      if (modelSaveResult) modelSaveResult.hidden = true;
      hideModelPostSaveActions();
      updateModelSaveState();
    });
    saveModelDev.addEventListener('click', saveModelToDev);
    saveModelImageReplace?.addEventListener('click', saveModelImageReplacePending);
    cancelModelEdit?.addEventListener('click', () => exitModelEditMode());
    continueModelRegister?.addEventListener('click', () => {
      editingModelId = '';
      updateModelEditUi();
      clearModelRegisterForm();
      if (modelFormMessage) modelFormMessage.textContent = '続けて登録できます。';
      modelFormIdBase?.focus({ preventScroll: true });
      document.querySelector('.model-register-tool')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    goModelsList?.addEventListener('click', scrollToModelsList);
    openModelGitHubActions?.addEventListener('click', () => {
      window.open(githubActionsIndexUrl, '_blank', 'noopener,noreferrer');
    });
    updateModelEditUi();
    updateModelSaveState();
  }

  async function init() {
    try {
      const [worksResult, modelsResult] = await Promise.all([
        fetchWorksForAdmin(),
        fetchModelsForAdmin()
      ]);
      const works = worksResult.works;
      const models = modelsResult.models;

      if (page === 'works') renderWorks(works, models, worksResult);
      if (page === 'models') renderModels(models, works, modelsResult);
      if (page === 'models') initModelRegisterTool(models);
      if (page === 'works') initImagePreviewTool(models, works);
    } catch (err) {
      console.error(err);
      message.textContent = '静的JSONを読み込めませんでした。Cloudflareの再デプロイで /data/*.json が公開されているか確認してください。';
    }
  }

  init();
}());
