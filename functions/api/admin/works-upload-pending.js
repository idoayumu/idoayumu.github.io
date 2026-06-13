import { jsonResponse, requireAdminSession } from '../../_shared/access-auth.js';
import {
  createGitHubInstallationToken,
  formatJson,
  publicError,
  readGitHubConfig,
  worksJsonPath
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
const workIdPattern = /^\d{6}[A-Za-z0-9][A-Za-z0-9_-]*_\d{4}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

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
    const targetConfig = withTargetBranch(config.value);
    const payload = await parsePendingUploadForm(request);
    const installationToken = await createGitHubInstallationToken(targetConfig);
    const result = await savePendingUpload(targetConfig, installationToken, payload);
    return jsonResponse({
      success: true,
      ...session.body,
      branch: targetConfig.branch,
      workId: payload.work.id,
      commitSha: result.commitSha,
      commitUrl: result.commitUrl,
      pendingFiles: result.pendingFiles
    });
  } catch (err) {
    console.error('Works pending upload failed', err);
    return jsonResponse({
      success: false,
      ...session.body,
      error: publicErrorWithDetails(err, 'works_upload_pending_failed')
    }, err.status || 500);
  }
}

export async function onRequestGet() {
  return jsonResponse({
    success: false,
    error: {
      code: 'method_not_allowed',
      message: 'pending保存はPOSTで実行してください。'
    }
  }, 405);
}

async function savePendingUpload(config, installationToken, { work, original, originalExtension }) {
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
  const srcEntry = findTreeBlob(tree, worksJsonPath);
  if (!srcEntry?.sha) {
    const err = new Error(`${worksJsonPath} がGitHub上で見つかりません。`);
    err.code = 'works_json_not_found';
    err.status = 404;
    throw err;
  }

  const works = parseWorksJson(
    await getBlobText(config, installationToken, srcEntry.sha, worksJsonPath),
    worksJsonPath
  );
  assertWorkIdAvailable(works, work.id);

  const pendingFiles = buildPendingPaths(work.id, originalExtension);
  assertPendingPathsAvailable(tree, work.id, pendingFiles);

  const [originalBase64, workBlob] = await Promise.all([
    fileToBase64(original),
    createTextBlob(config, installationToken, formatJson(work))
  ]);
  const originalBlob = await createBase64Blob(config, installationToken, originalBase64);

  const nextTree = await createTree(config, installationToken, {
    baseTreeSha,
    entries: [
      { path: pendingFiles.original, sha: originalBlob.sha },
      { path: pendingFiles.workJson, sha: workBlob.sha }
    ]
  });
  const nextCommit = await createCommit(config, installationToken, {
    message: `Upload pending work ${work.id}`,
    treeSha: nextTree.sha,
    parentSha: sourceHeadSha
  });
  await updateBranchRef(config, installationToken, nextCommit.sha);

  return {
    commitSha: nextCommit.sha,
    commitUrl: nextCommit.html_url || `https://github.com/${config.owner}/${config.repo}/commit/${nextCommit.sha}`,
    pendingFiles: [pendingFiles.original, pendingFiles.workJson]
  };
}

async function parsePendingUploadForm(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    throw httpError(400, 'invalid_multipart_form', 'multipart/form-dataを解析できませんでした。');
  }

  const work = normalizePendingWork(parseWorkField(form.get('work')));
  const original = form.get('original');
  const originalExtension = assertOriginalImage(original);

  return { work, original, originalExtension };
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

function normalizePendingWork(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
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

  return {
    id,
    title,
    date,
    location,
    production,
    caption,
    modelIds,
    image: `/images/works/large/${id}.webp`,
    thumbnail: `/images/works/thumbs/${id}.webp`
  };
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

function buildPendingPaths(workId, extension) {
  const base = `tools/admin/uploads/works/pending/${workId}`;
  return {
    original: `${base}/original.${extension}`,
    alternateOriginal: `${base}/original.${extension === 'jpg' ? 'png' : 'jpg'}`,
    workJson: `${base}/work.json`
  };
}

function assertPendingPathsAvailable(tree, workId, pendingFiles) {
  const existing = [
    pendingFiles.original,
    pendingFiles.alternateOriginal,
    pendingFiles.workJson
  ].filter((filePath) => findTreeBlob(tree, filePath));

  if (existing.length) {
    throw httpError(409, 'pending_work_exists', `同じworkIdのpendingデータが既に存在します: ${workId}`, {
      files: existing
    });
  }
}

function assertWorkIdAvailable(works, workId) {
  if (works.some((work) => work?.id === workId)) {
    throw httpError(409, 'duplicate_work_id', `既存IDです: ${workId}`);
  }
}

function parseWorksJson(text, label) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (err) {
    err.code = 'github_json_parse_failed';
    err.message = `${label} のJSONを解析できませんでした: ${err.message}`;
    throw err;
  }

  if (!Array.isArray(value)) {
    throw httpError(500, 'invalid_works_json', `${label} が配列ではありません。`);
  }

  return value;
}

function normalizeModelIds(value) {
  if (Array.isArray(value)) return value.map(trim).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map(trim).filter(Boolean);
  return [];
}

function isFileLike(value) {
  return value && typeof value === 'object' && typeof value.arrayBuffer === 'function';
}

function trim(value) {
  return String(value || '').trim();
}

function withTargetBranch(config) {
  return {
    ...config,
    branch: targetBranch
  };
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
