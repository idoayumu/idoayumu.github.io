import { jsonResponse, requireAdminSession } from '../../_shared/access-auth.js';
import {
  createGitHubInstallationToken,
  formatJson,
  publicError,
  readGitHubConfig,
  settingsJsonPath
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
const kinds = new Set(['hero', 'about']);

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
      kind: payload.settings.kind,
      commitSha: result.commitSha,
      commitUrl: result.commitUrl,
      pendingFiles: result.pendingFiles
    });
  } catch (err) {
    console.error('Settings image pending upload failed', err);
    return jsonResponse({
      success: false,
      ...session.body,
      error: publicErrorWithDetails(err, 'settings_image_upload_pending_failed')
    }, err.status || 500);
  }
}

async function savePending(config, installationToken, { settings, original, originalExtension }) {
  const ref = await getBranchRef(config, installationToken);
  const sourceHeadSha = ref?.object?.sha;
  if (!sourceHeadSha) throw httpError(500, 'github_ref_missing', `${config.branch} の最新refを取得できませんでした。`);

  const headCommit = await getGitCommit(config, installationToken, sourceHeadSha);
  const baseTreeSha = headCommit?.tree?.sha;
  if (!baseTreeSha) throw httpError(500, 'github_tree_missing', '最新commitのtreeを取得できませんでした。');

  const tree = await getRecursiveTree(config, installationToken, baseTreeSha);
  const settingsEntry = findTreeBlob(tree, settingsJsonPath);
  if (!settingsEntry?.sha) throw httpError(404, 'settings_json_not_found', `${settingsJsonPath} がGitHub上で見つかりません。`);

  parseSettingsJson(await getBlobText(config, installationToken, settingsEntry.sha, settingsJsonPath), settingsJsonPath);

  const pendingFiles = buildPendingPaths(settings.kind, originalExtension);
  assertPendingAvailable(tree, settings.kind);

  const [originalBase64, settingsBlob] = await Promise.all([
    fileToBase64(original),
    createTextBlob(config, installationToken, formatJson(settings))
  ]);
  const originalBlob = await createBase64Blob(config, installationToken, originalBase64);

  const nextTree = await createTree(config, installationToken, {
    baseTreeSha,
    entries: [
      { path: pendingFiles.original, sha: originalBlob.sha },
      { path: pendingFiles.settingsJson, sha: settingsBlob.sha }
    ]
  });
  const nextCommit = await createCommit(config, installationToken, {
    message: `Upload pending ${settings.kind} image`,
    treeSha: nextTree.sha,
    parentSha: sourceHeadSha
  });
  await updateBranchRef(config, installationToken, nextCommit.sha);

  return {
    commitSha: nextCommit.sha,
    commitUrl: nextCommit.html_url || `https://github.com/${config.owner}/${config.repo}/commit/${nextCommit.sha}`,
    pendingFiles: [pendingFiles.original, pendingFiles.settingsJson]
  };
}

async function parseForm(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    throw httpError(400, 'invalid_multipart_form', 'multipart/form-dataを解析できませんでした。');
  }

  const settings = normalizeSettings(parseJsonField(form.get('settings'), 'settings'));
  const original = form.get('original');
  const originalExtension = assertOriginalImage(original);
  return { settings, original, originalExtension };
}

function normalizeSettings(input) {
  const kind = String(input?.kind || '').trim();
  if (!kinds.has(kind)) throw httpError(400, 'invalid_settings_image_kind', 'kindはheroまたはaboutを指定してください。');
  const year = Number(input?.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw httpError(400, 'invalid_settings_year', 'yearは2000から2100の整数で指定してください。');
  }
  return {
    kind,
    year,
    season: trim(input?.season) || 'spring',
    memo: trim(input?.memo)
  };
}

function buildPendingPaths(kind, extension) {
  const id = `${kind}-${timestampForPath()}`;
  const base = `tools/admin/uploads/settings/pending/${id}`;
  return {
    original: `${base}/original.${extension}`,
    settingsJson: `${base}/settings.json`
  };
}

function assertPendingAvailable(tree, kind) {
  const root = 'tools/admin/uploads/settings/pending/';
  const existing = (tree?.tree || []).filter((entry) => entry?.path?.startsWith(root) && entry.path.endsWith('/settings.json'));
  if (existing.some((entry) => entry.path.includes(`/${kind}-`))) {
    throw httpError(409, 'pending_settings_image_exists', `${kind}画像のpendingが既に存在します。`, {
      files: existing.map((entry) => entry.path)
    });
  }
}

function assertOriginalImage(file) {
  if (!file || typeof file.arrayBuffer !== 'function' || !file.size) {
    throw httpError(400, 'missing_original_image', '新しい画像を選択してください。');
  }
  const type = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  if (type.includes('heic') || type.includes('heif') || /\.(heic|heif)$/.test(name)) {
    throw httpError(400, 'unsupported_image_type', 'HEIC/HEIFは非対応です。JPEGまたはPNGを選択してください。');
  }
  if (file.size > maxOriginalFileSize) {
    throw httpError(413, 'original_image_too_large', '画像サイズが30MBを超えています。');
  }
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

function parseSettingsJson(text, label) {
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object expected');
    return value;
  } catch (err) {
    err.code = 'github_json_parse_failed';
    err.message = `${label} のJSONを解析できませんでした: ${err.message}`;
    throw err;
  }
}

function timestampForPath() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function trim(value) {
  return String(value || '').trim();
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
