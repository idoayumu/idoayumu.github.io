(function () {
  const siteImageBaseUrl = 'https://idoayumu.github.io';
  const page = document.body.dataset.staticList || '';
  const list = document.getElementById('staticList');
  const search = document.getElementById('staticSearch');
  const message = document.getElementById('staticMessage');
  const previewWorkId = document.getElementById('previewWorkId');
  const previewTitle = document.getElementById('previewTitle');
  const previewModelIds = document.getElementById('previewModelIds');
  const previewImageInput = document.getElementById('previewImageInput');
  const previewMessage = document.getElementById('previewMessage');
  const previewMeta = document.getElementById('previewMeta');
  const previewImages = document.getElementById('previewImages');
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
  const confirmModels = document.getElementById('confirmModels');
  const confirmLargePath = document.getElementById('confirmLargePath');
  const confirmThumbPath = document.getElementById('confirmThumbPath');
  const largeMaxEdge = 2000;
  const thumbMaxEdge = 700;
  let originalPreviewUrl = '';
  let largePreviewUrl = '';
  let thumbPreviewUrl = '';
  let generatedExtension = 'webp';
  let previewModels = [];

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

  function selectedModelNames() {
    const selected = Array.from(previewModelIds?.querySelectorAll('input[type="checkbox"]:checked') || [])
      .map((input) => input.value);
    return selected.map((id) => previewModels.find((model) => model.id === id)?.name || id).filter(Boolean);
  }

  function updateSavePreview() {
    if (!savePreviewSummary) return;
    const workId = String(previewWorkId?.value || '').trim();
    const title = String(previewTitle?.value || '').trim();
    const modelNames = selectedModelNames();

    confirmWorkId.textContent = workId || '未入力';
    confirmTitle.textContent = title || '未入力';
    confirmModels.textContent = modelNames.join('・') || '未選択';
    confirmLargePath.textContent = workId ? `/images/works/large/${workId}.${generatedExtension}` : '未入力';
    confirmThumbPath.textContent = workId ? `/images/works/thumbs/${workId}.${generatedExtension}` : '未入力';
  }

  function populatePreviewModels(models) {
    if (!previewModelIds) return;
    previewModels = models;
    previewModelIds.innerHTML = models.map((model) => (
      `<label class="preview-model-chip">
        <input type="checkbox" value="${escapeHtml(model.id)}">
        <span>${escapeHtml(model.name || model.displayName || model.id)}</span>
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
    previewMessage.textContent = '画像を生成中です...';
    previewMeta.hidden = true;
    previewImages.hidden = true;
    savePreviewSummary.hidden = true;

    try {
      originalPreviewUrl = URL.createObjectURL(file);
      const originalImage = await loadImageFromUrl(originalPreviewUrl);
      const large = await renderToBlob(originalImage, largeMaxEdge, 0.85);
      const thumb = await renderToBlob(originalImage, thumbMaxEdge, 0.8);

      if (!large.blob || !thumb.blob) throw new Error('画像生成に失敗しました。');

      generatedExtension = large.extension === 'webp' && thumb.extension === 'webp' ? 'webp' : 'jpg';
      largePreviewUrl = URL.createObjectURL(large.blob);
      thumbPreviewUrl = URL.createObjectURL(thumb.blob);

      previewFileName.textContent = file.name || '-';
      previewMimeType.textContent = file.type || '未取得';
      previewFileSize.textContent = formatBytes(file.size);
      previewImageSize.textContent = `${originalImage.naturalWidth} x ${originalImage.naturalHeight}px`;
      previewOriginalImage.src = originalPreviewUrl;
      previewLargeImage.src = largePreviewUrl;
      previewThumbImage.src = thumbPreviewUrl;
      previewLargeMeta.textContent = `${large.width} x ${large.height}px / ${large.type} / ${formatBytes(large.blob.size)}`;
      previewThumbMeta.textContent = `${thumb.width} x ${thumb.height}px / ${thumb.type} / ${formatBytes(thumb.blob.size)}`;

      previewMeta.hidden = false;
      previewImages.hidden = false;
      savePreviewSummary.hidden = false;
      previewMessage.textContent = generatedExtension === 'webp'
        ? 'WebPでlarge/thumbを生成しました。保存はまだ行いません。'
        : 'WebP生成に対応していないためJPEGでlarge/thumbを生成しました。保存はまだ行いません。';
      updateSavePreview();
    } catch (err) {
      console.error(err);
      revokePreviewUrls();
      previewMessage.textContent = err.message || '画像生成に失敗しました。';
    }
  }

  function initImagePreviewTool(models) {
    if (!previewImageInput) return;
    populatePreviewModels(models);
    previewImageInput.addEventListener('change', handlePreviewImageChange);
    previewWorkId?.addEventListener('input', updateSavePreview);
    previewTitle?.addEventListener('input', updateSavePreview);
    previewModelIds?.addEventListener('change', updateSavePreview);
    updateSavePreview();
  }

  function socialLinks(model) {
    const links = model.links || {};
    return [
      ['Instagram', links.instagram],
      ['X', links.x || links.twitter],
      ['Threads', links.threads],
      [links.websiteLabel || 'Website', links.website]
    ].filter(([, url]) => url);
  }

  function renderWorks(works, models) {
    const modelById = new Map(models.map((model) => [model.id, model]));

    function namesFor(work) {
      return getWorkModelIds(work).map((id) => modelById.get(id)?.name || id).filter(Boolean);
    }

    function render() {
      const query = normalizeText(search.value);
      const visible = works.filter((work) => {
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
        return `
          <article class="static-list-card">
            <div class="static-list-thumb">${thumb ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(work.title || work.id)}" loading="lazy">` : ''}</div>
            <div class="static-list-body">
              <h3>${escapeHtml(work.title || '(無題)')}</h3>
              <p>${escapeHtml(names)} / ${escapeHtml(work.date || '日付未設定')}</p>
              <p>${escapeHtml(work.location || '撮影地未設定')} / ${escapeHtml(work.production || 'Production未設定')}</p>
              <small>ID: ${escapeHtml(work.id)}</small>
            </div>
          </article>
        `;
      }).join('') || '<p class="note">一致する作品がありません。</p>';
    }

    search.addEventListener('input', render);
    render();
    message.textContent = `${works.length}件の作品を静的JSONから表示しています。保存・編集はできません。`;
  }

  function renderModels(models, works) {
    const workCountByModelId = new Map();
    works.forEach((work) => {
      getWorkModelIds(work).forEach((id) => {
        workCountByModelId.set(id, (workCountByModelId.get(id) || 0) + 1);
      });
    });

    function render() {
      const query = normalizeText(search.value);
      const visible = models.filter((model) => {
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
        return `
          <article class="static-list-card">
            <div class="static-list-thumb static-list-profile">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(model.name || model.id)}" loading="lazy">` : ''}</div>
            <div class="static-list-body">
              <h3>${escapeHtml(model.displayName || model.name || model.id)}</h3>
              <p>${escapeHtml(model.agency || '所属未設定')} / ${workCountByModelId.get(model.id) || 0} works</p>
              <p>${links}</p>
              <small>ID: ${escapeHtml(model.id)}</small>
            </div>
          </article>
        `;
      }).join('') || '<p class="note">一致するモデルがありません。</p>';
    }

    search.addEventListener('input', render);
    render();
    message.textContent = `${models.length}件のモデルを静的JSONから表示しています。保存・編集はできません。`;
  }

  async function init() {
    try {
      const [works, models] = await Promise.all([
        fetchJson('/data/works.json'),
        fetchJson('/data/models.json')
      ]);

      if (page === 'works') renderWorks(Array.isArray(works) ? works : [], Array.isArray(models) ? models : []);
      if (page === 'models') renderModels(Array.isArray(models) ? models : [], Array.isArray(works) ? works : []);
      if (page === 'works') initImagePreviewTool(Array.isArray(models) ? models : []);
    } catch (err) {
      console.error(err);
      message.textContent = '静的JSONを読み込めませんでした。Cloudflareの再デプロイで /data/*.json が公開されているか確認してください。';
    }
  }

  init();
}());
