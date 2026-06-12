(function () {
  const siteImageBaseUrl = 'https://idoayumu.github.io';
  const page = document.body.dataset.staticList || '';
  const list = document.getElementById('staticList');
  const search = document.getElementById('staticSearch');
  const message = document.getElementById('staticMessage');

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
    } catch (err) {
      console.error(err);
      message.textContent = '静的JSONを読み込めませんでした。Cloudflareの再デプロイで /data/*.json が公開されているか確認してください。';
    }
  }

  init();
}());
