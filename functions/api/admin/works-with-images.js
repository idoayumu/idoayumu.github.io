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
    const form = await parseWorkImageForm(request);
    const installationToken = await createGitHubInstallationToken(config.value);
    const result = await addWorkWithImages(config.value, installationToken, form);
    return jsonResponse({
      success: true,
      ...session.body,
      commitSha: result.commitSha,
      commitUrl: result.commitUrl,
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

export async function onRequestGet() {
  return jsonResponse({
    success: false,
    error: {
      code: 'method_not_allowed',
      message: '画像付き作品登録はPOSTで実行してください。'
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
