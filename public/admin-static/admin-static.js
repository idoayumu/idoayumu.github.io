(function () {
  const page = document.body.dataset.adminStaticPage || "";
  const dataEl = document.getElementById("adminStaticData");
  const data = dataEl ? JSON.parse(dataEl.textContent || "{}") : {};
  const works = Array.isArray(data.works) ? data.works : [];
  const models = Array.isArray(data.models) ? data.models : [];
  const modelById = new Map(models.map((model) => [model.id, model]));
  const draftKey = "kokei-note.static-admin.work-draft.v1";

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/[ァ-ン]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function modelImageUrl(model) {
    const imageName = model?.thumbnail || model?.profileImage || "";
    if (!imageName) return "";
    return imageName.startsWith("/images/") ? imageName : `/images/models/${imageName}`;
  }

  function getWorkModelIds(work) {
    return Array.isArray(work?.modelIds) ? work.modelIds : work?.models || [];
  }

  function getWorkModelNames(work) {
    const names = Array.isArray(work.modelNames) && work.modelNames.length
      ? work.modelNames
      : getWorkModelIds(work).map((id) => modelById.get(id)?.name || id);
    return names.filter(Boolean);
  }

  function workThumbUrl(work) {
    return work.thumbUrl || work.thumbnail || work.image || "";
  }

  function setupWorksPage() {
    const list = document.getElementById("adminStaticList");
    const search = document.getElementById("adminStaticSearch");
    if (!list || !search) return;

    function render() {
      const query = normalizeText(search.value);
      const visible = works.filter((work) => {
        const text = normalizeText([
          work.id,
          work.title,
          work.date,
          work.location,
          work.production,
          ...getWorkModelNames(work),
          ...getWorkModelIds(work),
        ].join(" "));
        return !query || text.includes(query);
      });

      list.innerHTML = visible.map((work) => {
        const thumb = workThumbUrl(work);
        const names = getWorkModelNames(work).join("・") || "モデル未設定";
        return `
          <article class="admin-static-work">
            <div class="admin-static-thumb">
              ${thumb ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(work.title || work.id)}" loading="lazy">` : ""}
            </div>
            <div class="admin-static-item-body">
              <h2>${escapeHtml(work.title || "(無題)")}</h2>
              <p class="admin-static-meta">${escapeHtml(names)} / ${escapeHtml(work.date || "日付未設定")}</p>
              <p class="admin-static-meta">${escapeHtml(work.location || "撮影地未設定")} / ${escapeHtml(work.production || "Production未設定")}</p>
              <p class="admin-static-small">ID: ${escapeHtml(work.id)}</p>
            </div>
          </article>
        `;
      }).join("") || '<p class="admin-static-notice">一致する作品がありません。</p>';
    }

    search.addEventListener("input", render);
    render();
  }

  function socialLinks(model) {
    const links = model.links || {};
    return [
      ["Instagram", links.instagram],
      ["X", links.x || links.twitter],
      ["Threads", links.threads],
      [links.websiteLabel || "Website", links.website],
    ].filter(([, url]) => url);
  }

  function setupModelsPage() {
    const list = document.getElementById("adminStaticList");
    const search = document.getElementById("adminStaticSearch");
    if (!list || !search) return;

    function render() {
      const query = normalizeText(search.value);
      const visible = models.filter((model) => {
        const linkText = socialLinks(model).map(([, url]) => url).join(" ");
        const text = normalizeText([
          model.id,
          model.name,
          model.displayName,
          model.nameKana,
          model.agency,
          linkText,
          ...(Array.isArray(model.aliases) ? model.aliases : []),
        ].join(" "));
        return !query || text.includes(query);
      });

      list.innerHTML = visible.map((model) => {
        const image = modelImageUrl(model);
        const links = socialLinks(model).map(([label, url]) => (
          `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
        )).join(" / ") || "SNS未設定";
        return `
          <article class="admin-static-model">
            <div class="admin-static-profile">
              ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(model.name || model.id)}" loading="lazy">` : ""}
            </div>
            <div class="admin-static-item-body">
              <h2>${escapeHtml(model.displayName || model.name || model.id)}</h2>
              <p class="admin-static-meta">${escapeHtml(model.agency || "所属未設定")} / ${Number(model.workCount || 0)} works</p>
              <p class="admin-static-small">${links}</p>
              <p class="admin-static-small">ID: ${escapeHtml(model.id)}</p>
            </div>
          </article>
        `;
      }).join("") || '<p class="admin-static-notice">一致するモデルがありません。</p>';
    }

    search.addEventListener("input", render);
    render();
  }

  function todayPrefix() {
    const now = new Date();
    return [
      String(now.getFullYear()).slice(-2),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("");
  }

  function setupRegisterPage() {
    const form = document.getElementById("adminStaticRegisterForm");
    if (!form) return;

    const imageFile = document.getElementById("staticImageFile");
    const imagePreview = document.getElementById("staticImagePreview");
    const imageInfo = document.getElementById("staticImageInfo");
    const modelSearch = document.getElementById("staticModelSearch");
    const suggestions = document.getElementById("staticModelSuggestions");
    const selectedModels = document.getElementById("staticSelectedModels");
    const datePrefix = document.getElementById("staticDatePrefix");
    const workIdModelName = document.getElementById("staticWorkIdModelName");
    const sequence = document.getElementById("staticWorkIdSequence");
    const workIdPreview = document.getElementById("staticWorkIdPreview");
    const workIdWarning = document.getElementById("staticWorkIdWarning");
    const confirmPanel = document.getElementById("staticConfirmPanel");
    const confirmList = document.getElementById("staticConfirmList");
    const generatedJson = document.getElementById("staticGeneratedJson");
    const result = document.getElementById("staticRegisterResult");
    const selected = new Set();

    datePrefix.textContent = todayPrefix();

    function selectedModelArray() {
      return Array.from(selected);
    }

    function modelSortValue(id) {
      const model = modelById.get(id);
      return normalizeText(model?.nameKana || model?.name || id);
    }

    function syncWorkIdModelName() {
      const value = selectedModelArray()
        .sort((a, b) => modelSortValue(a).localeCompare(modelSortValue(b), "ja") || a.localeCompare(b))
        .join("_");
      workIdModelName.value = value;
      updateWorkId();
    }

    function generatedWorkId() {
      const modelName = workIdModelName.value.trim();
      const seq = sequence.value.trim();
      if (!/^[A-Za-z0-9_]+$/.test(modelName) || !/^\d{4}$/.test(seq)) return "";
      return `${datePrefix.textContent}${modelName}_${seq}`;
    }

    function updateWorkId() {
      const id = generatedWorkId();
      workIdPreview.textContent = id || "未入力";
      const duplicate = id && works.some((work) => work.id === id);
      workIdWarning.textContent = duplicate ? "この作品IDは既に存在します。" : "";
      hideConfirm();
    }

    function renderSelected() {
      const ids = selectedModelArray();
      selectedModels.innerHTML = ids.map((id) => {
        const model = modelById.get(id);
        const label = model ? `${model.name || id}${model.agency ? ` / ${model.agency}` : ""}` : id;
        return `<button type="button" class="admin-static-chip" data-remove-model="${escapeHtml(id)}">${escapeHtml(label)} ×</button>`;
      }).join("") || '<span class="admin-static-small">未選択</span>';
    }

    function renderSuggestions() {
      const query = normalizeText(modelSearch.value);
      if (!query) {
        suggestions.innerHTML = '<span class="admin-static-small">モデル名やIDを入力すると候補が表示されます。</span>';
        return;
      }
      const matches = models.filter((model) => {
        const text = normalizeText([
          model.id,
          model.name,
          model.displayName,
          model.nameKana,
          model.agency,
          ...(Array.isArray(model.aliases) ? model.aliases : []),
        ].join(" "));
        return text.includes(query);
      }).slice(0, 8);

      suggestions.innerHTML = matches.map((model) => (
        `<button type="button" class="admin-static-suggestion" data-add-model="${escapeHtml(model.id)}" ${selected.has(model.id) ? "disabled" : ""}>${escapeHtml(model.name || model.id)}</button>`
      )).join("") || '<span class="admin-static-small">一致するモデル候補がありません。</span>';
    }

    function hideConfirm() {
      confirmPanel.hidden = true;
      confirmList.innerHTML = "";
      generatedJson.textContent = "";
    }

    function imageSummary() {
      const file = imageFile.files && imageFile.files[0];
      return file ? `${file.name} (${Math.round(file.size / 1024).toLocaleString()} KB)` : "未選択";
    }

    function buildEntry() {
      const id = generatedWorkId();
      return {
        id,
        title: form.elements.title.value.trim(),
        date: form.elements.date.value,
        location: form.elements.location.value.trim(),
        production: form.elements.production.value.trim(),
        caption: form.elements.caption.value.trim(),
        modelIds: selectedModelArray(),
        image: id ? `/images/works/large/${id}.webp` : "",
        thumbnail: id ? `/images/works/thumbs/${id}.webp` : "",
      };
    }

    function appendConfirmRow(label, value) {
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value || "未設定";
      row.append(dt, dd);
      confirmList.appendChild(row);
    }

    function showConfirm() {
      if (!form.reportValidity()) return;
      const entry = buildEntry();
      if (!entry.modelIds.length) {
        result.textContent = "モデルを1件以上選択してください。";
        return;
      }
      if (!entry.id) {
        result.textContent = "作品ID用モデル名と通し番号を確認してください。";
        return;
      }
      if (works.some((work) => work.id === entry.id)) {
        result.textContent = "既存IDと重複しています。通し番号などを変更してください。";
        return;
      }

      confirmList.innerHTML = "";
      appendConfirmRow("作品ID", entry.id);
      appendConfirmRow("タイトル", entry.title);
      appendConfirmRow("撮影日", entry.date);
      appendConfirmRow("撮影地", entry.location);
      appendConfirmRow("Production", entry.production);
      appendConfirmRow("モデル", entry.modelIds.map((id) => modelById.get(id)?.name || id).join(" / "));
      appendConfirmRow("画像", imageSummary());
      generatedJson.textContent = JSON.stringify(entry, null, 2);
      confirmPanel.hidden = false;
      result.textContent = "保存は行われません。内容確認専用です。";
    }

    function collectDraft() {
      return {
        title: form.elements.title.value,
        date: form.elements.date.value,
        location: form.elements.location.value,
        production: form.elements.production.value,
        caption: form.elements.caption.value,
        modelIds: selectedModelArray(),
        workIdModelName: workIdModelName.value,
        sequence: sequence.value,
      };
    }

    function applyDraft(draft) {
      form.elements.title.value = draft.title || "";
      form.elements.date.value = draft.date || "";
      form.elements.location.value = draft.location || "";
      form.elements.production.value = draft.production || "";
      form.elements.caption.value = draft.caption || "";
      selected.clear();
      (Array.isArray(draft.modelIds) ? draft.modelIds : []).forEach((id) => selected.add(id));
      workIdModelName.value = draft.workIdModelName || "";
      sequence.value = draft.sequence || "";
      imageFile.value = "";
      imagePreview.innerHTML = "";
      imageInfo.textContent = "";
      renderSelected();
      renderSuggestions();
      updateWorkId();
      hideConfirm();
    }

    imageFile.addEventListener("change", () => {
      imagePreview.innerHTML = "";
      const file = imageFile.files && imageFile.files[0];
      imageInfo.textContent = imageSummary();
      if (!file) return;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      img.onload = () => URL.revokeObjectURL(url);
      imagePreview.appendChild(img);
      hideConfirm();
    });

    modelSearch.addEventListener("input", renderSuggestions);
    suggestions.addEventListener("click", (event) => {
      const button = event.target.closest("[data-add-model]");
      if (!button) return;
      selected.add(button.getAttribute("data-add-model"));
      modelSearch.value = "";
      syncWorkIdModelName();
      renderSelected();
      renderSuggestions();
    });
    selectedModels.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-model]");
      if (!button) return;
      selected.delete(button.getAttribute("data-remove-model"));
      syncWorkIdModelName();
      renderSelected();
      renderSuggestions();
    });

    workIdModelName.addEventListener("input", updateWorkId);
    sequence.addEventListener("input", updateWorkId);
    form.addEventListener("input", hideConfirm);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      showConfirm();
    });

    document.getElementById("staticSaveDraft").addEventListener("click", () => {
      localStorage.setItem(draftKey, JSON.stringify(collectDraft()));
      result.textContent = "下書きを保存しました。画像ファイル自体は保存されません。";
      hideConfirm();
    });
    document.getElementById("staticRestoreDraft").addEventListener("click", () => {
      const raw = localStorage.getItem(draftKey);
      if (!raw) {
        result.textContent = "復元できる下書きがありません。";
        return;
      }
      applyDraft(JSON.parse(raw));
      result.textContent = "下書きを復元しました。画像は選び直してください。";
    });
    document.getElementById("staticDeleteDraft").addEventListener("click", () => {
      localStorage.removeItem(draftKey);
      result.textContent = "下書きを削除しました。";
      hideConfirm();
    });

    renderSelected();
    renderSuggestions();
    updateWorkId();
  }

  if (page === "works") setupWorksPage();
  if (page === "models") setupModelsPage();
  if (page === "register") setupRegisterPage();
}());
