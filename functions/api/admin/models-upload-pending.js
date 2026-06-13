import { jsonResponse, requireAdminSession } from '../../_shared/access-auth.js';
import {
  createGitHubInstallationToken,
  formatJson,
  modelsJsonPath,
  publicError,
  readGitHubConfig
} from '../../_shared/github-app.js';
import {
  createBase64Blob,
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
import { fileToBase64 } from '../../_shared/work-image-upload.js';

const targetBranch = 'dev';
const maxOriginalFileSize = 30 * 1024 * 1024;
const modelIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

  try {
    const targetConfig = {
      ...config.value,
      branch: targetBranch
    };
    const payload = await parsePendingModelForm(request);
    const installationToken = await createGitHubInstallationToken(targetConfig);
    const result = await savePendingModelUpload(targetConfig, installationToken, payload);

    return jsonResponse({
      success: true,
      ...session.body,
      branch: targetConfig.branch,
      modelId: payload.model.id,
      commitSha: result.commitSha,
      commitUrl: result.commitUrl,
      pendingFiles: result.pendingFiles
    });
  } catch (err) {
    console.error('Models pending upload failed', err);
    return jsonResponse({
      success: false,
      ...session.body,
      error: publicErrorWithDetails(err, 'models_upload_pending_failed')
    }, err.status || 500);
  }
}

export async function onRequestGet() {
  return jsonResponse({
    success: false,
    error: {
      code: 'method_not_allowed',
      message: 'モデルpending保存はPOSTで実行してください。'
    }
  }, 405);
}

async function savePendingModelUpload(config, installationToken, { model, original, originalExtension }) {
  const ref = await getBranchRef(config, installationToken);
  const sourceHeadSha = ref?.object?.sha;
  if (!sourceHeadSha) {
    throw httpError(500, 'github_ref_missing', `${config.branch} の最新refを取得できませんでした。`);
  }

  const headCommit = await getGitCommit(config, installationToken, sourceHeadSha);
  const baseTreeSha = headCommit?.tree?.sha;
  if (!baseTreeSha) {
    throw httpError(500, 'github_tree_missing', '最新commitのtreeを取得できませんでした。');
  }

  const tree = await getRecursiveTree(config, installationToken, baseTreeSha);
  const modelsEntry = findTreeBlob(tree, modelsJsonPath);
  if (!modelsEntry?.sha) {
    throw httpError(404, 'models_json_not_found', `${modelsJsonPath} がGitHub上で見つかりません。`);
  }

  const models = parseModelsJson(
    await getBlobText(config, installationToken, modelsEntry.sha, modelsJsonPath),
    modelsJsonPath
  );
  assertModelIdAvailable(models, model.id);

  const pendingFiles = buildPendingPaths(model.id, originalExtension);
  assertPendingPathsAvailable(tree, model.id, pendingFiles);

  const [originalBase64, modelBlob] = await Promise.all([
    fileToBase64(original),
    createTextBlob(config, installationToken, formatJson(model))
  ]);
  const originalBlob = await createBase64Blob(config, installationToken, originalBase64);

  const nextTree = await createTree(config, installationToken, {
    baseTreeSha,
    entries: [
      { path: pendingFiles.original, sha: originalBlob.sha },
      { path: pendingFiles.modelJson, sha: modelBlob.sha }
    ]
  });
  const nextCommit = await createCommit(config, installationToken, {
    message: `Upload pending model ${model.id}`,
    treeSha: nextTree.sha,
    parentSha: sourceHeadSha
  });
  await updateBranchRef(config, installationToken, nextCommit.sha);

  return {
    commitSha: nextCommit.sha,
    commitUrl: nextCommit.html_url || `https://github.com/${config.owner}/${config.repo}/commit/${nextCommit.sha}`,
    pendingFiles: [pendingFiles.original, pendingFiles.modelJson]
  };
}

async function parsePendingModelForm(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    throw httpError(400, 'invalid_multipart_form', 'multipart/form-dataを解析できませんでした。');
  }

  const model = normalizePendingModel(parseModelField(form.get('model')));
  const original = form.get('original');
  const originalExtension = assertOriginalImage(original);
  return { model, original, originalExtension };
}

function parseModelField(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw httpError(400, 'missing_model_payload', 'modelのJSON文字列が不足しています。');
  }

  try {
    return JSON.parse(value);
  } catch {
    throw httpError(400, 'invalid_model_json', 'modelのJSONを解析できませんでした。');
  }
}

function normalizePendingModel(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError(400, 'invalid_model_payload', 'モデルデータが不正です。');
  }

  const model = {
    id: trim(input.id),
    name: trim(input.name),
    shortName: trim(input.shortName),
    yomi: trim(input.yomi),
    agency: trim(input.agency),
    x: normalizeSocialUrl(input.x, 'x'),
    instagram: normalizeSocialUrl(input.instagram, 'instagram'),
    threads: normalizeSocialUrl(input.threads, 'threads'),
    otherUrl: trim(input.otherUrl),
    otherLabel: trim(input.otherLabel)
  };
  const missing = [];
  if (!model.id) missing.push('model.id');
  if (!model.name) missing.push('model.name');
  if (missing.length) {
    throw httpError(400, 'missing_required_fields', '必須項目が不足しています。', { missing });
  }

  if (!modelIdPattern.test(model.id)) {
    throw httpError(
      400,
      'invalid_model_id',
      'モデルIDは半角英小文字、数字、ハイフンのみで入力してください。'
    );
  }

  return model;
}

function assertOriginalImage(file) {
  if (!isFileLike(file) || !file.size) {
    throw httpError(400, 'missing_original_image', 'original画像が不足しています。');
  }

  const type = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  if (type.includes('heic') || type.includes('heif') || /\.(heic|heif)$/.test(name)) {
    throw httpError(400, 'unsupported_image_type', 'HEIC/HEIFは非対応です。JPEGまたはPNGを選択してください。', {
      receivedType: file.type || ''
    });
  }

  if (file.size > maxOriginalFileSize) {
    throw httpError(413, 'original_image_too_large', '元画像のサイズが30MBを超えています。', {
      maxBytes: maxOriginalFileSize,
      receivedBytes: file.size
    });
  }

  if (type === 'image/jpeg' || /\.(jpe?g)$/.test(name)) return 'jpg';
  if (type === 'image/png' || /\.png$/.test(name)) return 'png';

  throw httpError(400, 'unsupported_image_type', 'original画像はJPEGまたはPNGのみ対応しています。', {
    receivedType: file.type || ''
  });
}

function buildPendingPaths(modelId, extension) {
  const base = `tools/admin/uploads/models/pending/${modelId}`;
  return {
    original: `${base}/original.${extension}`,
    alternateOriginal: `${base}/original.${extension === 'jpg' ? 'png' : 'jpg'}`,
    modelJson: `${base}/model.json`
  };
}

function assertPendingPathsAvailable(tree, modelId, pendingFiles) {
  const existing = [
    pendingFiles.original,
    pendingFiles.alternateOriginal,
    pendingFiles.modelJson
  ].filter((filePath) => findTreeBlob(tree, filePath));

  if (existing.length) {
    throw httpError(409, 'pending_model_exists', `同じmodelIdのpendingデータが既に存在します: ${modelId}`, {
      files: existing
    });
  }
}

function assertModelIdAvailable(models, modelId) {
  if (models.some((model) => model?.id === modelId)) {
    throw httpError(409, 'duplicate_model_id', `既存IDです: ${modelId}`);
  }
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
    throw httpError(500, 'invalid_models_json', `${label} が配列ではありません。`);
  }

  return value;
}

function isFileLike(value) {
  return value && typeof value === 'object' && typeof value.arrayBuffer === 'function';
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

function httpError(status, code, message, details = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  err.details = details;
  return err;
}
