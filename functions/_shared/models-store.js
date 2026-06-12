import {
  formatJson,
  getContentFile,
  modelsJsonPath,
  parseJsonContent,
  updateContentFile
} from './github-app.js';

export { modelsJsonPath };

export async function getModels(config, installationToken) {
  const modelsFile = await getContentFile(config, installationToken, modelsJsonPath);
  const models = parseJsonContent(modelsFile, modelsJsonPath);
  assertModelsArray(models);
  return { modelsFile, models };
}

export function findModelById(models, id) {
  return models.find((model) => model?.id === id) || null;
}

export function addModel(models, input) {
  const normalized = normalizeModel(input);
  if (!normalized.ok) return normalized;
  const validation = validateModel(normalized.value, models, { requireUniqueId: true });
  if (!validation.ok) return validation;

  return {
    ok: true,
    model: normalized.value,
    nextModels: [...models, normalized.value],
    commitMessage: `Add model ${normalized.value.id}`
  };
}

export function updateModel(models, id, input) {
  const modelId = trim(id);
  if (!modelId) return validationError('missing_model_id', '編集対象のモデルIDが不足しています。');

  const targetIndex = models.findIndex((model) => model?.id === modelId);
  if (targetIndex === -1) return modelNotFound(modelId);
  if (input?.id && trim(input.id) !== modelId) {
    return validationError('model_id_not_editable', 'モデルIDは変更できません。');
  }

  const current = models[targetIndex];
  const normalized = normalizeModel({ ...current, ...input, id: modelId });
  if (!normalized.ok) return normalized;
  if (normalized.value.id !== modelId) {
    return validationError('model_id_not_editable', 'モデルIDは変更できません。');
  }

  const validation = validateModel(normalized.value, models, { currentId: modelId });
  if (!validation.ok) return validation;

  const nextModels = models.map((model, index) => (
    index === targetIndex ? normalized.value : model
  ));
  return {
    ok: true,
    model: normalized.value,
    nextModels,
    commitMessage: `Update model ${modelId}`
  };
}

export function deleteModel(models, id) {
  const modelId = trim(id);
  if (!modelId) return validationError('missing_model_id', '削除対象のモデルIDが不足しています。');
  if (!findModelById(models, modelId)) return modelNotFound(modelId);

  return {
    ok: true,
    nextModels: models.filter((model) => model?.id !== modelId),
    commitMessage: `Delete model ${modelId}`
  };
}

export async function saveModels(config, installationToken, modelsFile, nextModels, message) {
  return updateContentFile(config, installationToken, {
    filePath: modelsJsonPath,
    content: formatJson(nextModels),
    sha: modelsFile.sha,
    message
  });
}

function normalizeModel(input) {
  if (!isObject(input)) {
    return validationError('invalid_model_payload', 'モデルデータが不正です。');
  }

  const links = isObject(input.links) ? input.links : {};
  const model = {
    id: trim(input.id),
    name: trim(input.name),
    displayName: trim(input.displayName),
    nameKana: trim(input.nameKana),
    nameEn: trim(input.nameEn),
    aliases: normalizeAliases(input.aliases),
    agency: trim(input.agency),
    bio: trim(input.bio),
    thumbnail: trim(input.thumbnail || input.profileImage),
    links: {
      instagram: trim(links.instagram),
      x: trim(links.x || links.twitter),
      threads: trim(links.threads),
      website: trim(links.website),
      websiteLabel: trim(links.websiteLabel)
    },
    featured: Boolean(input.featured),
    profileImagePosition: normalizeProfileImagePosition(input.profileImagePosition)
  };

  if (!model.displayName) delete model.displayName;
  if (!model.profileImagePosition) delete model.profileImagePosition;
  return { ok: true, value: model };
}

function validateModel(model, models, { requireUniqueId = false, currentId = '' } = {}) {
  const missing = ['id', 'name', 'thumbnail'].filter((key) => !model[key]);
  if (missing.length) {
    return validationError('missing_required_fields', '必須項目が不足しています。', { missing });
  }

  if (!/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(model.id)) {
    return validationError('invalid_model_id', 'モデルIDは英数字、アンダースコア、ハイフンで入力してください。');
  }

  const duplicate = models.some((item) => (
    item?.id === model.id && (requireUniqueId || item.id !== currentId)
  ));
  if (duplicate) {
    return {
      ok: false,
      status: 409,
      error: {
        code: 'duplicate_model_id',
        message: `既存IDです: ${model.id}`
      }
    };
  }

  if (model.profileImagePosition && !['left center', 'center', 'right center'].includes(model.profileImagePosition)) {
    return validationError(
      'invalid_profile_image_position',
      'profileImagePositionは left center, center, right center のいずれかで入力してください。'
    );
  }

  return { ok: true };
}

function assertModelsArray(models) {
  if (!Array.isArray(models)) {
    const err = new Error('現在のmodels.jsonが配列ではありません。');
    err.code = 'invalid_models_json';
    throw err;
  }
}

function modelNotFound(id) {
  return {
    ok: false,
    status: 404,
    error: {
      code: 'model_not_found',
      message: `モデルが見つかりません: ${id}`
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

function normalizeAliases(value) {
  if (Array.isArray(value)) return value.map(trim).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map(trim).filter(Boolean);
  return [];
}

function normalizeProfileImagePosition(value) {
  const text = trim(value);
  return text || 'center';
}

function trim(value) {
  return String(value || '').trim();
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
