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
import {
  buildWorkImagePaths,
  fileToBase64,
  parseWorkImageForm
} from '../../_shared/work-image-upload.js';

const adminWorksJsonPath = 'tools/admin/public/data/works.json';
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

  try {
    const targetConfig = withTargetBranch(config.value);
    const form = await parseWorkImageForm(request);
    const installationToken = await createGitHubInstallationToken(targetConfig);
    const result = await addWorkWithImages(targetConfig, installationToken, form);
    return jsonResponse({
      success: true,
      ...session.body,
      commitSha: result.commitSha,
      commitUrl: result.commitUrl,
      branch: targetConfig.branch,
      workId: form.work.id,
      updatedFiles: result.updatedFiles
    });
  } catch (err) {
    console.error('Works with images mutation failed', err);
    return jsonResponse({
      success: false,
      ...session.body,
      error: publicErrorWithDetails(err, 'works_with_images_failed')
    }, err.status || 500);
  }
}

export async function onRequestDelete({ request, env }) {
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
    const workId = await parseDeleteWorkId(request);
    const installationToken = await createGitHubInstallationToken(targetConfig);
    const result = await deleteWorkWithImages(targetConfig, installationToken, workId);
    return jsonResponse({
      success: true,
      ...session.body,
      commitSha: result.commitSha,
      commitUrl: result.commitUrl,
      branch: targetConfig.branch,
      deletedWorkId: workId,
      deletedFiles: result.deletedFiles,
      updatedFiles: result.updatedFiles
    });
  } catch (err) {
    console.error('Works with images delete failed', err);
    return jsonResponse({
      success: false,
      ...session.body,
      error: publicErrorWithDetails(err, 'works_with_images_delete_failed')
    }, err.status || 500);
  }
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

  try {
    const targetConfig = withTargetBranch(config.value);
    const payload = await parsePatchPayload(request);
    const installationToken = await createGitHubInstallationToken(targetConfig);
    const result = await updateWorkMetadata(targetConfig, installationToken, payload);
    return jsonResponse({
      success: true,
      ...session.body,
      commitSha: result.commitSha,
      commitUrl: result.commitUrl,
      branch: targetConfig.branch,
      updatedWorkId: payload.id,
      updatedFiles: result.updatedFiles
    });
  } catch (err) {
    console.error('Works with images metadata update failed', err);
    return jsonResponse({
      success: false,
      ...session.body,
      error: publicErrorWithDetails(err, 'works_with_images_patch_failed')
    }, err.status || 500);
  }
}

export async function onRequestGet() {
  return jsonResponse({
    success: false,
    error: {
      code: 'method_not_allowed',
      message: '画像付き作品登録はPOST、編集はPATCH、削除はDELETEで実行してください。'
    }
  }, 405);
}

async function addWorkWithImages(config, installationToken, { work, large, thumb }) {
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

  const imagePaths = buildWorkImagePaths(work.id);
  assertImagePathsAvailable(tree, [imagePaths.largeRepoPath, imagePaths.thumbRepoPath]);

  const srcText = await getBlobText(config, installationToken, srcEntry.sha, worksJsonPath);
  const works = parseWorksJson(srcText, worksJsonPath);
  assertWorkIdAvailable(works, work.id);

  const nextWorksJson = formatJson([...works, work]);
  const [largeBase64, thumbBase64] = await Promise.all([
    fileToBase64(large),
    fileToBase64(thumb)
  ]);

  const [largeBlob, thumbBlob, srcBlob, adminBlob] = await Promise.all([
    createBase64Blob(config, installationToken, largeBase64),
    createBase64Blob(config, installationToken, thumbBase64),
    createTextBlob(config, installationToken, nextWorksJson),
    createTextBlob(config, installationToken, nextWorksJson)
  ]);

  const updatedFiles = [
    imagePaths.largeRepoPath,
    imagePaths.thumbRepoPath,
    worksJsonPath,
    adminWorksJsonPath
  ];
  const nextTree = await createTree(config, installationToken, {
    baseTreeSha,
    entries: [
      { path: imagePaths.largeRepoPath, sha: largeBlob.sha },
      { path: imagePaths.thumbRepoPath, sha: thumbBlob.sha },
      { path: worksJsonPath, sha: srcBlob.sha },
      { path: adminWorksJsonPath, sha: adminBlob.sha }
    ]
  });
  const nextCommit = await createCommit(config, installationToken, {
    message: `Add work ${work.id} with images`,
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

async function updateWorkMetadata(config, installationToken, { id, updates }) {
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

  const srcText = await getBlobText(config, installationToken, srcEntry.sha, worksJsonPath);
  const works = parseWorksJson(srcText, worksJsonPath);
  const targetIndex = works.findIndex((work) => work?.id === id);
  if (targetIndex === -1) {
    const err = new Error(`作品が見つかりません: ${id}`);
    err.status = 404;
    err.code = 'work_not_found';
    throw err;
  }

  const current = works[targetIndex];
  const nextWork = {
    ...current,
    ...updates,
    id: current.id,
    image: current.image,
    thumbnail: current.thumbnail
  };
  validatePatchedWork(nextWork);

  const nextWorks = works.map((work, index) => (
    index === targetIndex ? nextWork : work
  ));
  const nextWorksJson = formatJson(nextWorks);
  const [srcBlob, adminBlob] = await Promise.all([
    createTextBlob(config, installationToken, nextWorksJson),
    createTextBlob(config, installationToken, nextWorksJson)
  ]);

  const updatedFiles = [
    worksJsonPath,
    adminWorksJsonPath
  ];
  const nextTree = await createTree(config, installationToken, {
    baseTreeSha,
    entries: [
      { path: worksJsonPath, sha: srcBlob.sha },
      { path: adminWorksJsonPath, sha: adminBlob.sha }
    ]
  });
  const nextCommit = await createCommit(config, installationToken, {
    message: `Update work ${id} metadata`,
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

async function deleteWorkWithImages(config, installationToken, workId) {
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

  const adminEntry = findTreeBlob(tree, adminWorksJsonPath);
  if (!adminEntry?.sha) {
    const err = new Error(`${adminWorksJsonPath} がGitHub上で見つかりません。`);
    err.code = 'admin_works_json_not_found';
    err.status = 404;
    throw err;
  }

  const imagePaths = buildWorkImagePaths(workId);
  const missingImageFiles = [
    imagePaths.largeRepoPath,
    imagePaths.thumbRepoPath
  ].filter((filePath) => !findTreeBlob(tree, filePath));
  if (missingImageFiles.length) {
    const err = new Error('削除対象の画像ファイルが見つかりません。');
    err.status = 404;
    err.code = 'image_file_not_found';
    err.details = { missingFiles: missingImageFiles };
    throw err;
  }

  const [srcText, adminText] = await Promise.all([
    getBlobText(config, installationToken, srcEntry.sha, worksJsonPath),
    getBlobText(config, installationToken, adminEntry.sha, adminWorksJsonPath)
  ]);
  const srcWorks = parseWorksJson(srcText, worksJsonPath);
  const adminWorks = parseWorksJson(adminText, adminWorksJsonPath);
  assertWorkExists(srcWorks, workId);

  const nextSrcWorksJson = formatJson(srcWorks.filter((work) => work?.id !== workId));
  const nextAdminWorksJson = formatJson(adminWorks.filter((work) => work?.id !== workId));
  const [srcBlob, adminBlob] = await Promise.all([
    createTextBlob(config, installationToken, nextSrcWorksJson),
    createTextBlob(config, installationToken, nextAdminWorksJson)
  ]);

  const deletedFiles = [
    imagePaths.largeRepoPath,
    imagePaths.thumbRepoPath
  ];
  const updatedFiles = [
    worksJsonPath,
    adminWorksJsonPath
  ];
  const nextTree = await createTree(config, installationToken, {
    baseTreeSha,
    entries: [
      { path: worksJsonPath, sha: srcBlob.sha },
      { path: adminWorksJsonPath, sha: adminBlob.sha },
      { path: imagePaths.largeRepoPath, sha: null },
      { path: imagePaths.thumbRepoPath, sha: null }
    ]
  });
  const nextCommit = await createCommit(config, installationToken, {
    message: `Delete work ${workId} with images`,
    treeSha: nextTree.sha,
    parentSha: sourceHeadSha
  });
  await updateBranchRef(config, installationToken, nextCommit.sha);

  return {
    commitSha: nextCommit.sha,
    commitUrl: nextCommit.html_url || `https://github.com/${config.owner}/${config.repo}/commit/${nextCommit.sha}`,
    deletedFiles,
    updatedFiles
  };
}

function withTargetBranch(config) {
  return {
    ...config,
    branch: targetBranch
  };
}

function assertImagePathsAvailable(tree, paths) {
  const existing = paths.filter((filePath) => findTreeBlob(tree, filePath));
  if (existing.length) {
    const err = new Error('保存予定の画像ファイルが既に存在します。');
    err.status = 409;
    err.code = 'image_file_exists';
    err.details = { files: existing };
    throw err;
  }
}

function assertWorkIdAvailable(works, workId) {
  if (works.some((item) => item?.id === workId)) {
    const err = new Error(`既存IDです: ${workId}`);
    err.status = 409;
    err.code = 'duplicate_work_id';
    throw err;
  }
}

function assertWorkExists(works, workId) {
  if (!works.some((item) => item?.id === workId)) {
    const err = new Error(`作品が見つかりません: ${workId}`);
    err.status = 404;
    err.code = 'work_not_found';
    throw err;
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
    const err = new Error(`${label} が配列ではありません。`);
    err.code = 'invalid_works_json';
    throw err;
  }

  return value;
}

async function parsePatchPayload(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    const err = new Error('リクエストJSONを解析できませんでした。');
    err.status = 400;
    err.code = 'invalid_json';
    throw err;
  }

  const id = String(payload?.id || '').trim();
  if (!id) {
    const err = new Error('編集対象の作品IDが不足しています。');
    err.status = 400;
    err.code = 'missing_work_id';
    throw err;
  }

  if (!/^\d{6}[A-Za-z0-9][A-Za-z0-9_-]*_\d{4}$/.test(id)) {
    const err = new Error('作品IDの形式が不正です。');
    err.status = 400;
    err.code = 'invalid_work_id';
    throw err;
  }

  const updates = payload?.updates;
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    const err = new Error('updatesが不正です。');
    err.status = 400;
    err.code = 'invalid_updates';
    throw err;
  }

  const forbidden = ['id', 'image', 'thumbnail'].filter((key) => (
    Object.prototype.hasOwnProperty.call(updates, key)
  ));
  if (forbidden.length) {
    const err = new Error('id / image / thumbnail はこのAPIでは編集できません。');
    err.status = 400;
    err.code = 'forbidden_update_fields';
    err.details = { forbidden };
    throw err;
  }

  const allowedKeys = new Set(['title', 'date', 'location', 'production', 'caption', 'modelIds']);
  const unknown = Object.keys(updates).filter((key) => !allowedKeys.has(key));
  if (unknown.length) {
    const err = new Error('編集できない項目が含まれています。');
    err.status = 400;
    err.code = 'unknown_update_fields';
    err.details = { unknown };
    throw err;
  }

  const normalizedUpdates = {};
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'modelIds') {
      if (!Array.isArray(value)) {
        const err = new Error('modelIdsは配列で指定してください。');
        err.status = 400;
        err.code = 'invalid_model_ids';
        throw err;
      }
      normalizedUpdates.modelIds = value.map((item) => String(item || '').trim()).filter(Boolean);
    } else {
      normalizedUpdates[key] = String(value || '').trim();
    }
  }

  return { id, updates: normalizedUpdates };
}

async function parseDeleteWorkId(request) {
  let payload;
  try {
    const text = await request.text();
    payload = text ? JSON.parse(text) : {};
  } catch {
    const err = new Error('リクエストJSONを解析できませんでした。');
    err.status = 400;
    err.code = 'invalid_json';
    throw err;
  }

  const workId = String(payload.id || payload.workId || '').trim();
  if (!workId) {
    const err = new Error('削除対象の作品IDが不足しています。');
    err.status = 400;
    err.code = 'missing_work_id';
    throw err;
  }

  if (!/^\d{6}[A-Za-z0-9][A-Za-z0-9_-]*_\d{4}$/.test(workId)) {
    const err = new Error('作品IDの形式が不正です。');
    err.status = 400;
    err.code = 'invalid_work_id';
    throw err;
  }

  return workId;
}

function validatePatchedWork(work) {
  const missing = ['title', 'date', 'location'].filter((key) => !String(work[key] || '').trim());
  if (missing.length) {
    const err = new Error('必須項目が空です。');
    err.status = 400;
    err.code = 'missing_required_fields';
    err.details = { missing };
    throw err;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(work.date || ''))) {
    const err = new Error('日付はYYYY-MM-DD形式で入力してください。');
    err.status = 400;
    err.code = 'invalid_date';
    throw err;
  }

  if (!Array.isArray(work.modelIds) || !work.modelIds.length) {
    const err = new Error('modelIdsは1件以上必要です。');
    err.status = 400;
    err.code = 'missing_model_ids';
    throw err;
  }
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
