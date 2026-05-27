const useSourcePathChk = document.getElementById('useSourcePath');
const fileMode = document.getElementById('fileMode');
const pathMode = document.getElementById('pathMode');
const imageFile = document.getElementById('imageFile');
const preview = document.getElementById('preview');
const form = document.getElementById('metaForm');
const result = document.getElementById('result');

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

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  result.textContent = '登録中...';

  const fd = new FormData(form);
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
