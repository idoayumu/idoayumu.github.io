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

export async function onRequestPost({ request, env }) {
  const session = await requireAdminSession(request, env);
  if (!session.ok) return jsonResponse(session.body, session.status);

  const config = readGitHubConfig(env);
  if (!config.ok) {
    return jsonResponse({ success: false, ...session.body, error: config.error }, 500);
  }

  try {
    const targetConfig = { ...config.value, branch: targetBranch };
    const payload = await parseForm(request);
    const installationToken = await createGitHubInstallationToken(targetConfig);
    const result = await savePending(targetConfig, installationToken, payload);
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
    console.error('Model image replace pending upload failed', err);
    return jsonResponse({
      success: false,
      ...session.body,
      error: publicErrorWithDetails(err, 'model_image_replace_pending_failed')
    }, err.status || 500);
  }
}

async function savePending(config, installationToken, { model, original, originalExtension }) {
  const ref = await getBranchRef(config, installationToken);
  const sourceHeadSha = ref?.object?.sha;
  if (!sourceHeadSha) throw httpError(500, 'github_ref_missing', `${config.branch} の最新refを取得できませんでした。`);

  const headCommit = await getGitCommit(config, installationToken, sourceHeadSha);
  const baseTreeSha = headCommit?.tree?.sha;
  if (!baseTreeSha) throw httpError(500, 'github_tree_missing', '最新commitのtreeを取得できませんでした。');

  const tree = await getRecursiveTree(config, installationToken, baseTreeSha);
  const modelsEntry = findTreeBlob(tree, modelsJsonPath);
  if (!modelsEntry?.sha) throw httpError(404, 'models_json_not_found', `${modelsJsonPath} がGitHub上で見つかりません。`);

  const models = parseModelsJson(await getBlobText(config, installationToken, modelsEntry.sha, modelsJsonPath), modelsJsonPath);
  const current = models.find((item) => item?.id === model.id);
  if (!current) throw httpError(404, 'model_not_found', `モデルが見つかりません: ${model.id}`);

  const pendingFiles = buildPendingPaths(model.id, originalExtension);
  assertPendingAvailable(tree, model.id);

  const [originalBase64, modelBlob] = await Promise.all([
    fileToBase64(original),
    createTextBlob(config, installationToken, formatJson({ id: model.id }))
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
    message: `Upload pending model image ${model.id}`,
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

async function parseForm(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    throw httpError(400, 'invalid_multipart_form', 'multipart/form-dataを解析できませんでした。');
  }
  const model = normalizeModel(parseJsonField(form.get('model'), 'model'));
  const original = form.get('original');
  const originalExtension = assertOriginalImage(original);
  return { model, original, originalExtension };
}

function normalizeModel(input) {
  const id = String(input?.id || '').trim();
  if (!id) throw httpError(400, 'missing_model_id', 'モデルIDが不足しています。');
  return { id };
}

function buildPendingPaths(modelId, extension) {
  const base = `tools/admin/uploads/models/replace-pending/${modelId}`;
  return {
    original: `${base}/original.${extension}`,
    alternateOriginal: `${base}/original.${extension === 'jpg' ? 'png' : 'jpg'}`,
    modelJson: `${base}/model.json`
  };
}

function assertPendingAvailable(tree, modelId) {
  const base = `tools/admin/uploads/models/replace-pending/${modelId}/`;
  const existing = (tree?.tree || []).filter((entry) => entry?.path?.startsWith(base)).map((entry) => entry.path);
  if (existing.length) throw httpError(409, 'pending_model_image_replace_exists', `同じモデルのプロフィール画像差し替えpendingが既に存在します: ${modelId}`, { files: existing });
}

function assertOriginalImage(file) {
  if (!file || typeof file.arrayBuffer !== 'function' || !file.size) throw httpError(400, 'missing_original_image', '新しい画像を選択してください。');
  const type = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  if (type.includes('heic') || type.includes('heif') || /\.(heic|heif)$/.test(name)) throw httpError(400, 'unsupported_image_type', 'HEIC/HEIFは非対応です。JPEGまたはPNGを選択してください。');
  if (file.size > maxOriginalFileSize) throw httpError(413, 'original_image_too_large', '画像サイズが30MBを超えています。');
  if (type === 'image/jpeg' || /\.(jpe?g)$/.test(name)) return 'jpg';
  if (type === 'image/png' || /\.png$/.test(name)) return 'png';
  throw httpError(400, 'unsupported_image_type', 'JPEGまたはPNGを選択してください。');
}

function parseJsonField(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw httpError(400, `missing_${label}_payload`, `${label}が不足しています。`);
  try {
    return JSON.parse(value);
  } catch {
    throw httpError(400, `invalid_${label}_json`, `${label}のJSONを解析できませんでした。`);
  }
}

function parseModelsJson(text, label) {
  try {
    const value = JSON.parse(text);
    if (!Array.isArray(value)) throw new Error('array expected');
    return value;
  } catch (err) {
    err.code = 'github_json_parse_failed';
    err.message = `${label} のJSONを解析できませんでした: ${err.message}`;
    throw err;
  }
}

function publicErrorWithDetails(err, fallbackCode) {
  const error = publicError(err, fallbackCode);
  if (err.details && Object.keys(err.details).length) return { ...error, ...err.details };
  return error;
}

function httpError(status, code, message, details = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  err.details = details;
  return err;
}
