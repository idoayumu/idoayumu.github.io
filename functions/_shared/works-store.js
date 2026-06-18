import {
  formatJson,
  getContentFile,
  modelsJsonPath,
  parseJsonContent,
  updateContentFile,
  worksJsonPath
} from './github-app.js';

export { worksJsonPath };

export async function getWorks(config, installationToken) {
  const worksFile = await getContentFile(config, installationToken, worksJsonPath);
  const works = parseJsonContent(worksFile, worksJsonPath);
  assertWorksArray(works);
  return { worksFile, works };
}

export async function getWorksAndModels(config, installationToken) {
  const [worksFile, modelsFile] = await Promise.all([
    getContentFile(config, installationToken, worksJsonPath),
    getContentFile(config, installationToken, modelsJsonPath)
  ]);
  const works = parseJsonContent(worksFile, worksJsonPath);
  const models = parseJsonContent(modelsFile, modelsJsonPath);
  assertWorksArray(works);
  return { worksFile, works, models: Array.isArray(models) ? models : [] };
}

export function findWorkById(works, id) {
  return works.find((work) => work?.id === id) || null;
}

export function addWork(works, models, input) {
  const normalized = normalizeWork(input, { requireId: true });
  const validation = validateWork(normalized.value, works, models, { requireUniqueId: true });
  if (!validation.ok) return validation;
  return {
    ok: true,
    work: normalized.value,
    nextWorks: [...works, normalized.value],
    commitMessage: `Add work ${normalized.value.id}`
  };
}

export function updateWork(works, models, id, input) {
  const workId = trim(id);
  if (!workId) return validationError('missing_work_id', '編集対象の作品IDが不足しています。');

  const targetIndex = works.findIndex((work) => work?.id === workId);
  if (targetIndex === -1) return workNotFound(workId);

  const current = works[targetIndex];
  const normalized = normalizeWork({ ...current, ...input, id: workId }, { requireId: true });
  if (normalized.value.id !== workId) {
    return validationError('work_id_not_editable', '作品IDは変更できません。');
  }

  const validation = validateWork(normalized.value, works, models, { currentId: workId });
  if (!validation.ok) return validation;

  const nextWorks = works.map((work, index) => (
    index === targetIndex ? normalized.value : work
  ));
  return {
    ok: true,
    work: normalized.value,
    nextWorks,
    commitMessage: `Update work ${workId}`
  };
}

export function deleteWork(works, id) {
  const workId = trim(id);
  if (!workId) return validationError('missing_work_id', '削除対象の作品IDが不足しています。');
  if (!findWorkById(works, workId)) return workNotFound(workId);

  return {
    ok: true,
    nextWorks: works.filter((work) => work?.id !== workId),
    commitMessage: `Delete work ${workId}`
  };
}

export async function saveWorks(config, installationToken, worksFile, nextWorks, message) {
  return updateContentFile(config, installationToken, {
    filePath: worksJsonPath,
    content: formatJson(nextWorks),
    sha: worksFile.sha,
    message
  });
}

function normalizeWork(input, { requireId }) {
  if (!isObject(input)) {
    return validationError('invalid_work_payload', '作品データが不正です。');
  }

  if (Object.prototype.hasOwnProperty.call(input, 'sourcePath')) {
    return validationError('source_path_not_allowed', 'sourcePathはCloudflare保存APIでは受け付けません。');
  }

  const id = trim(input.id);
  if (requireId && !id) return validationError('missing_work_id', '作品IDが不足しています。');

  return {
    ok: true,
    value: {
      id,
      title: trim(input.title),
      date: trim(input.date),
      location: trim(input.location),
      production: trim(input.production),
      caption: trim(input.caption),
      modelIds: normalizeModelIds(input.modelIds),
      image: trim(input.image || `/images/works/large/${id}.webp`),
      thumbnail: trim(input.thumbnail || `/images/works/thumbs/${id}.webp`)
    }
  };
}

function validateWork(work, works, models, { requireUniqueId = false, currentId = '' } = {}) {
  const required = ['id', 'title', 'date', 'location', 'production', 'image', 'thumbnail'];
  const missing = required.filter((key) => !work[key]);
  if (missing.length) {
    return validationError('missing_required_fields', '必須項目が不足しています。', { missing });
  }

  if (!/^\d{6}[A-Za-z0-9][A-Za-z0-9_-]*_\d{4}$/.test(work.id)) {
    return validationError(
      'invalid_work_id',
      '作品IDは YYMMDD + モデル名 + _ + 4桁通し番号 の形式で入力してください。'
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(work.date)) {
    return validationError('invalid_date', '日付はYYYY-MM-DD形式で入力してください。');
  }

  if (!Array.isArray(work.modelIds) || !work.modelIds.length) {
    return validationError('missing_model_ids', 'modelIdsは1件以上必要です。');
  }

  const duplicate = works.some((item) => (
    item?.id === work.id && (requireUniqueId || item.id !== currentId)
  ));
  if (duplicate) {
    return {
      ok: false,
      status: 409,
      error: {
        code: 'duplicate_work_id',
        message: `既存IDです: ${work.id}`
      }
    };
  }

  const modelIds = new Set(Array.isArray(models) ? models.map((model) => model?.id).filter(Boolean) : []);
  const unknownModelIds = work.modelIds.filter((modelId) => !modelIds.has(modelId));
  if (unknownModelIds.length) {
    return validationError(
      'unknown_model_ids',
      `models.jsonに存在しないモデルIDです: ${unknownModelIds.join(', ')}`,
      { unknownModelIds }
    );
  }

  const invalidImagePath = [work.image, work.thumbnail].find((value) => !value.startsWith('/images/'));
  if (invalidImagePath) {
    return validationError('invalid_image_path', '画像パスは /images/ 配下を指定してください。');
  }

  return { ok: true };
}

function assertWorksArray(works) {
  if (!Array.isArray(works)) {
    const err = new Error('現在のworks.jsonが配列ではありません。');
    err.code = 'invalid_works_json';
    throw err;
  }
}

function workNotFound(id) {
  return {
    ok: false,
    status: 404,
    error: {
      code: 'work_not_found',
      message: `作品が見つかりません: ${id}`
    }
  };
}

function validationError(code, message, details = {}) {
  return {
    ok: false,
    status: 400,
    error: {
      code,
      message,
      ...details
    }
  };
}

function normalizeModelIds(value) {
  if (Array.isArray(value)) {
    return value.map(trim).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(',').map(trim).filter(Boolean);
  }

  return [];
}

function trim(value) {
  return String(value || '').trim();
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
