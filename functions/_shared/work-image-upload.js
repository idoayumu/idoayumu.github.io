const workIdPattern = /^\d{6}[A-Za-z0-9][A-Za-z0-9_-]*_\d{4}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const allowedImageType = 'image/webp';

export async function parseWorkImageForm(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    throw httpError(400, 'invalid_multipart_form', 'multipart/form-dataを解析できませんでした。');
  }

  const work = parseWorkField(form.get('work'));
  const large = form.get('large');
  const thumb = form.get('thumb');
  assertWebpFile(large, 'large');
  assertWebpFile(thumb, 'thumb');

  return {
    work: normalizeWork(work),
    large,
    thumb
  };
}

export function buildWorkImagePaths(workId) {
  return {
    largeJsonPath: `/images/works/large/${workId}.webp`,
    thumbJsonPath: `/images/works/thumbs/${workId}.webp`,
    largeRepoPath: `public/images/works/large/${workId}.webp`,
    thumbRepoPath: `public/images/works/thumbs/${workId}.webp`
  };
}

export async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return bytesToBase64(bytes);
}

function parseWorkField(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw httpError(400, 'missing_work_payload', 'workのJSON文字列が不足しています。');
  }

  try {
    return JSON.parse(value);
  } catch {
    throw httpError(400, 'invalid_work_json', 'workのJSONを解析できませんでした。');
  }
}

function normalizeWork(input) {
  if (!isObject(input)) {
    throw httpError(400, 'invalid_work_payload', '作品データが不正です。');
  }

  const id = trim(input.id);
  const title = trim(input.title);
  const date = trim(input.date);
  const location = trim(input.location);
  const production = trim(input.production);
  const caption = trim(input.caption);
  const modelIds = normalizeModelIds(input.modelIds);
  const missing = [];
  if (!id) missing.push('work.id');
  if (!title) missing.push('work.title');
  if (!date) missing.push('work.date');
  if (!location) missing.push('work.location');
  if (!production) missing.push('work.production');
  if (!modelIds.length) missing.push('work.modelIds');

  if (missing.length) {
    throw httpError(400, 'missing_required_fields', '必須項目が不足しています。', { missing });
  }

  if (!workIdPattern.test(id)) {
    throw httpError(
      400,
      'invalid_work_id',
      '作品IDは YYMMDD + モデル名 + _ + 4桁通し番号 の形式で入力してください。'
    );
  }

  if (!datePattern.test(date)) {
    throw httpError(400, 'invalid_date', '日付はYYYY-MM-DD形式で入力してください。');
  }

  const paths = buildWorkImagePaths(id);
  return {
    id,
    title,
    date,
    location,
    production,
    caption,
    modelIds,
    image: paths.largeJsonPath,
    thumbnail: paths.thumbJsonPath
  };
}

function assertWebpFile(file, fieldName) {
  if (!isFileLike(file) || !file.size) {
    throw httpError(400, `missing_${fieldName}_image`, `${fieldName}画像が不足しています。`);
  }

  if (file.type !== allowedImageType) {
    throw httpError(400, `invalid_${fieldName}_image_type`, `${fieldName}画像はimage/webpのみ対応しています。`, {
      receivedType: file.type || ''
    });
  }
}

function normalizeModelIds(value) {
  if (Array.isArray(value)) return value.map(trim).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map(trim).filter(Boolean);
  return [];
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function isFileLike(value) {
  return value && typeof value === 'object' && typeof value.arrayBuffer === 'function';
}

function trim(value) {
  return String(value || '').trim();
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function httpError(status, code, message, details = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  err.details = details;
  return err;
}
