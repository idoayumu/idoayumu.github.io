import { jsonResponse, requireAdminSession } from '../../_shared/access-auth.js';
import {
  createGitHubInstallationToken,
  formatJson,
  modelsJsonPath,
  publicError,
  readGitHubConfig
} from '../../_shared/github-app.js';
import {
  createCommit,
  createTextBlob,
  createTree,
  findTreeBlob,
  getBlobText,
  getBranchRef,
  getGitCommit,
  getRecursiveTree,
  updateBranchRef
} from '../../_shared/github-git-data.js';
import {
  deleteModel,
  getModels,
  saveModels,
  updateModel
} from '../../_shared/models-store.js';

const adminModelsJsonPath = 'tools/admin/public/data/models.json';
const targetBranch = 'dev';

export async function onRequestPost({ request, env }) {
  const session = await requireAdminSession(request, env);
  if (!session.ok) return jsonResponse(session.body, session.status);

  const config = readGitHubConfig(env);
  if (!config.ok) {
    return jsonResponse({
      success: false,
      ...session.body,
      error: config.error
    }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({
      success: false,
      ...session.body,
      error: {
        code: 'invalid_json',
        message: 'リクエストJSONを解析できませんでした。'
      }
    }, 400);
  }

  try {
    const targetConfig = {
      ...config.value,
      branch: targetBranch
    };
    const model = normalizeNewModel(payload?.model || payload);
    const installationToken = await createGitHubInstallationToken(targetConfig);
    const result = await addModelToDev(targetConfig, installationToken, model);
    return jsonResponse({
      success: true,
      ...session.body,
      branch: targetConfig.branch,
      modelId: model.id,
      commitSha: result.commitSha,
      commitUrl: result.commitUrl,
      updatedFiles: result.updatedFiles
    });
  } catch (err) {
    console.error('Models dev add failed', err);
    return jsonResponse({
      success: false,
      ...session.body,
      error: publicErrorWithDetails(err, 'models_add_failed')
    }, err.status || 500);
  }
}

export async function onRequestPut({ request, env }) {
  return handleModelsMutation(request, env, async (payload, config, installationToken) => {
    const modelId = payload?.id;
    const patch = payload?.model || payload;
    const { modelsFile, models } = await getModels(config, installationToken);
    const result = updateModel(models, modelId, patch);
    if (!result.ok) return mutationError(result);

    const update = await saveModels(config, installationToken, modelsFile, result.nextModels, result.commitMessage);
    return jsonResponse({
      success: true,
      commitUrl: update.commit?.html_url,
      updatedFile: modelsJsonPath,
      updatedModelId: result.model.id
    });
  }, 'models_edit_failed');
}

export async function onRequestPatch({ request, env }) {
  const session = await requireAdminSession(request, env);
  if (!session.ok) return jsonResponse(session.body, session.status);

  const config = readGitHubConfig(env);
  if (!config.ok) {
    return jsonResponse({
      success: false,
      ...session.body,
      error: config.error
    }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({
      success: false,
      ...session.body,
      error: {
        code: 'invalid_json',
        message: 'リクエストJSONを解析できませんでした。'
      }
    }, 400);
  }

  try {
    const targetConfig = {
      ...config.value,
      branch: targetBranch
    };
    const modelId = trim(payload?.id);
    const updates = normalizeModelUpdates(payload?.updates || payload?.model || {});
    const installationToken = await createGitHubInstallationToken(targetConfig);
    const result = await updateModelOnDev(targetConfig, installationToken, modelId, updates);
    return jsonResponse({
      success: true,
      ...session.body,
      branch: targetConfig.branch,
      modelId,
      commitSha: result.commitSha,
      commitUrl: result.commitUrl,
      updatedFiles: result.updatedFiles
    });
  } catch (err) {
    console.error('Models dev patch failed', err);
    return jsonResponse({
      success: false,
      ...session.body,
      error: publicErrorWithDetails(err, 'models_patch_failed')
    }, err.status || 500);
  }
}

export async function onRequestDelete({ request, env }) {
  return handleModelsMutation(request, env, async (payload, config, installationToken) => {
    const { modelsFile, models } = await getModels(config, installationToken);
    const result = deleteModel(models, payload?.id);
    if (!result.ok) return mutationError(result);

    const update = await saveModels(config, installationToken, modelsFile, result.nextModels, result.commitMessage);
    return jsonResponse({
      success: true,
      commitUrl: update.commit?.html_url,
      updatedFile: modelsJsonPath,
      deletedModelId: payload.id
    });
  }, 'models_delete_failed');
}

export async function onRequestGet() {
  return jsonResponse({
    success: false,
    error: {
      code: 'method_not_allowed',
      message: 'モデルの追加はPOST、編集はPATCH/PUT、削除はDELETEで実行してください。'
    }
  }, 405);
}

async function handleModelsMutation(request, env, mutate, fallbackErrorCode) {
  const session = await requireAdminSession(request, env);
  if (!session.ok) return jsonResponse(session.body, session.status);

  const config = readGitHubConfig(env);
  if (!config.ok) {
    return jsonResponse({
      success: false,
      ...session.body,
      error: config.error
    }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({
      success: false,
      ...session.body,
      error: {
        code: 'invalid_json',
        message: 'リクエストJSONを解析できませんでした。'
      }
    }, 400);
  }

  try {
    const installationToken = await createGitHubInstallationToken(config.value);
    return await mutate(payload, config.value, installationToken);
  } catch (err) {
    console.error('Models JSON mutation failed', err);
    return jsonResponse({
      success: false,
      ...session.body,
      error: publicError(err, fallbackErrorCode)
    }, err.status || 500);
  }
}

function mutationError(result) {
  return jsonResponse({
    success: false,
    error: result.error
  }, result.status || 400);
}

async function updateModelOnDev(config, installationToken, modelId, updates) {
  if (!modelId) {
    const err = new Error('編集対象のモデルIDが不足しています。');
    err.status = 400;
    err.code = 'missing_model_id';
    throw err;
  }

  const ref = await getBranchRef(config, installationToken);
  const sourceHeadSha = ref?.object?.sha;
  if (!sourceHeadSha) {
    const err = new Error(`${config.branch} の最新refを取得できませんでした。`);
    err.code = 'github_ref_missing';
    throw err;
  }

  const headCommit = await getGitCommit(config, installationToken, sourceHeadSha);
  const baseTreeSha = headCommit?.tree?.sha;
  if (!baseTreeSha) {
    const err = new Error('最新commitのtreeを取得できませんでした。');
    err.code = 'github_tree_missing';
    throw err;
  }

  const tree = await getRecursiveTree(config, installationToken, baseTreeSha);
  const srcEntry = findTreeBlob(tree, modelsJsonPath);
  if (!srcEntry?.sha) {
    const err = new Error(`${modelsJsonPath} がGitHub上で見つかりません。`);
    err.status = 404;
    err.code = 'models_json_not_found';
    throw err;
  }

  const srcText = await getBlobText(config, installationToken, srcEntry.sha, modelsJsonPath);
  const models = parseModelsJson(srcText, modelsJsonPath);
  const index = models.findIndex((item) => item?.id === modelId);
  if (index === -1) {
    const err = new Error(`モデルが見つかりません: ${modelId}`);
    err.status = 404;
    err.code = 'model_not_found';
    throw err;
  }

  const nextModels = [...models];
  nextModels[index] = applyModelUpdates(models[index], updates);
  const nextModelsJson = formatJson(nextModels);
  const [srcBlob, adminBlob] = await Promise.all([
    createTextBlob(config, installationToken, nextModelsJson),
    createTextBlob(config, installationToken, nextModelsJson)
  ]);
  const updatedFiles = [modelsJsonPath, adminModelsJsonPath];

  const nextTree = await createTree(config, installationToken, {
    baseTreeSha,
    entries: [
      { path: modelsJsonPath, sha: srcBlob.sha },
      { path: adminModelsJsonPath, sha: adminBlob.sha }
    ]
  });
  const nextCommit = await createCommit(config, installationToken, {
    message: `Update model ${modelId}`,
    treeSha: nextTree.sha,
    parentSha: sourceHeadSha
  });
  await updateBranchRef(config, installationToken, nextCommit.sha);

  return {
    commitSha: nextCommit.sha,
    commitUrl: nextCommit.html_url || `https://github.com/${config.owner}/${config.repo}/commit/${nextCommit.sha}`,
    updatedFiles
  };
}

async function addModelToDev(config, installationToken, model) {
  const ref = await getBranchRef(config, installationToken);
  const sourceHeadSha = ref?.object?.sha;
  if (!sourceHeadSha) {
    const err = new Error(`${config.branch} の最新refを取得できませんでした。`);
    err.code = 'github_ref_missing';
    throw err;
  }

  const headCommit = await getGitCommit(config, installationToken, sourceHeadSha);
  const baseTreeSha = headCommit?.tree?.sha;
  if (!baseTreeSha) {
    const err = new Error('最新commitのtreeを取得できませんでした。');
    err.code = 'github_tree_missing';
    throw err;
  }

  const tree = await getRecursiveTree(config, installationToken, baseTreeSha);
  const srcEntry = findTreeBlob(tree, modelsJsonPath);
  if (!srcEntry?.sha) {
    const err = new Error(`${modelsJsonPath} がGitHub上で見つかりません。`);
    err.status = 404;
    err.code = 'models_json_not_found';
    throw err;
  }

  const srcText = await getBlobText(config, installationToken, srcEntry.sha, modelsJsonPath);
  const models = parseModelsJson(srcText, modelsJsonPath);
  if (models.some((item) => item?.id === model.id)) {
    const err = new Error(`既存IDです: ${model.id}`);
    err.status = 409;
    err.code = 'duplicate_model_id';
    throw err;
  }

  const nextModelsJson = formatJson([...models, model]);
  const [srcBlob, adminBlob] = await Promise.all([
    createTextBlob(config, installationToken, nextModelsJson),
    createTextBlob(config, installationToken, nextModelsJson)
  ]);
  const updatedFiles = [modelsJsonPath, adminModelsJsonPath];

  const nextTree = await createTree(config, installationToken, {
    baseTreeSha,
    entries: [
      { path: modelsJsonPath, sha: srcBlob.sha },
      { path: adminModelsJsonPath, sha: adminBlob.sha }
    ]
  });
  const nextCommit = await createCommit(config, installationToken, {
    message: `Add model ${model.id}`,
    treeSha: nextTree.sha,
    parentSha: sourceHeadSha
  });
  await updateBranchRef(config, installationToken, nextCommit.sha);

  return {
    commitSha: nextCommit.sha,
    commitUrl: nextCommit.html_url || `https://github.com/${config.owner}/${config.repo}/commit/${nextCommit.sha}`,
    updatedFiles
  };
}

function normalizeModelUpdates(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const err = new Error('モデル編集データが不正です。');
    err.status = 400;
    err.code = 'invalid_model_payload';
    throw err;
  }

  const name = trim(input.name);
  if (!name) {
    const err = new Error('名前は必須です。');
    err.status = 400;
    err.code = 'missing_required_fields';
    err.details = { missing: ['name'] };
    throw err;
  }

  return {
    name,
    shortName: trim(input.shortName),
    yomi: trim(input.yomi),
    agency: trim(input.agency),
    x: normalizeSocialUrl(input.x, 'x'),
    instagram: normalizeSocialUrl(input.instagram, 'instagram'),
    threads: normalizeSocialUrl(input.threads, 'threads'),
    otherUrl: trim(input.otherUrl),
    otherLabel: trim(input.otherLabel)
  };
}

function applyModelUpdates(current, updates) {
  const links = {
    ...(current.links || {}),
    instagram: updates.instagram,
    x: updates.x,
    threads: updates.threads,
    website: updates.otherUrl,
    websiteLabel: updates.otherLabel
  };

  const next = {
    ...current,
    name: updates.name,
    displayName: updates.shortName,
    nameKana: updates.yomi,
    agency: updates.agency,
    links
  };

  delete next.twitter;
  return next;
}

function normalizeNewModel(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const err = new Error('モデルデータが不正です。');
    err.status = 400;
    err.code = 'invalid_model_payload';
    throw err;
  }

  const id = trim(input.id);
  const name = trim(input.name);
  if (!id || !name) {
    const missing = [];
    if (!id) missing.push('id');
    if (!name) missing.push('name');
    const err = new Error('必須項目が不足しています。');
    err.status = 400;
    err.code = 'missing_required_fields';
    err.details = { missing };
    throw err;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    const err = new Error('モデルIDは半角英小文字、数字、ハイフンのみで入力してください。先頭/末尾/連続ハイフンとアンダースコアは使えません。');
    err.status = 400;
    err.code = 'invalid_model_id';
    throw err;
  }

  const links = {
    instagram: normalizeSocialUrl(input.instagram, 'instagram'),
    x: normalizeSocialUrl(input.x, 'x'),
    threads: normalizeSocialUrl(input.threads, 'threads'),
    website: trim(input.otherUrl),
    websiteLabel: trim(input.otherLabel)
  };
  const model = {
    id,
    name,
    aliases: [],
    agency: trim(input.agency),
    bio: '',
    links,
    featured: true
  };
  const shortName = trim(input.shortName);
  const yomi = trim(input.yomi);
  const profileImage = trim(input.profileImage);
  if (shortName) model.displayName = shortName;
  if (yomi) model.nameKana = yomi;
  if (profileImage) model.thumbnail = profileImage;
  return model;
}

function parseModelsJson(text, label) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (err) {
    err.code = 'github_json_parse_failed';
    err.message = `${label} のJSONを解析できませんでした: ${err.message}`;
    throw err;
  }
  if (!Array.isArray(value)) {
    const err = new Error(`${label} が配列ではありません。`);
    err.code = 'invalid_models_json';
    throw err;
  }
  return value;
}

function publicErrorWithDetails(err, fallbackCode) {
  const error = publicError(err, fallbackCode);
  if (err.details && Object.keys(err.details).length) {
    return {
      ...error,
      ...err.details
    };
  }
  return error;
}

function trim(value) {
  return String(value || '').trim();
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

function normalizeSocialUrl(value, service) {
  const raw = trim(value);
  if (!raw) return '';

  const urlHandle = /^https?:\/\//i.test(raw) ? extractSocialHandleFromUrl(raw, service) : '';
  const handle = (urlHandle || raw).replace(/^@/, '').replace(/\/+$/g, '').trim();
  if (!handle) return '';

  if (service === 'x') return `https://x.com/${handle}`;
  if (service === 'instagram') return `https://www.instagram.com/${handle}`;
  if (service === 'threads') return `https://www.threads.net/@${handle}`;
  return raw;
}
