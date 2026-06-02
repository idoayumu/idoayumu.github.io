const form = document.getElementById('modelForm');
const imageInput = document.getElementById('profileImage');
const preview = document.getElementById('preview');
const result = document.getElementById('result');
const warnings = document.getElementById('warnings');
const submitButton = document.getElementById('submitButton');
const confirmButton = document.getElementById('confirmButton');

let pendingFormData = null;

imageInput.addEventListener('change', () => {
  preview.innerHTML = '';
  const file = imageInput.files && imageInput.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  img.onload = () => URL.revokeObjectURL(url);
  preview.appendChild(img);
});

function buildFormData(force = false) {
  const fd = new FormData(form);
  fd.append('force', force ? 'true' : 'false');
  return fd;
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
        ${items.map((item) => `<li>${item.name} (${item.id}) - ${item.matched}</li>`).join('')}
      </ul>
    </div>
  `;
  confirmButton.hidden = false;
}

async function submit(force = false) {
  result.textContent = '登録中...';
  warnings.innerHTML = '';
  confirmButton.hidden = true;

  const fd = force && pendingFormData ? pendingFormData : buildFormData(force);
  if (force) fd.set('force', 'true');

  try {
    const resp = await fetch('/api/register', { method: 'POST', body: fd });
    const json = await resp.json();

    if (json.needsConfirmation) {
      pendingFormData = buildFormData(false);
      renderWarnings(json.warnings);
      result.textContent = json.message;
      return;
    }

    if (!resp.ok || !json.ok) {
      result.innerHTML = `<span class="error">失敗: ${json.message || resp.statusText}</span>`;
      return;
    }

    pendingFormData = null;
    renderWarnings(json.warnings);
    result.innerHTML = `
      <div class="success">登録成功</div>
      <pre>${JSON.stringify(json.entry, null, 2)}</pre>
    `;
    form.reset();
    preview.innerHTML = '';
  } catch (err) {
    console.error(err);
    result.innerHTML = '<span class="error">通信エラー</span>';
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
