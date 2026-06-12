import { jsonResponse, requireAdminSession } from '../../_shared/access-auth.js';
import {
  createGitHubInstallationToken,
  formatJson,
  publicError,
  readGitHubConfig,
  worksJsonPath
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

const adminWorksJsonPath = 'tools/admin/public/data/works.json';
const commitMessage = 'Test git data update works json';

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
    const installationToken = await createGitHubInstallationToken(config.value);
    const result = await syncWorksJsonPair(config.value, installationToken);
    return jsonResponse({
      success: true,
      ...session.body,
      commitSha: result.commitSha,
      commitUrl: result.commitUrl,
      updatedFiles: result.updatedFiles,
      branch: config.value.branch,
      sourceHeadSha: result.sourceHeadSha,
      adminWorksJsonExisted: result.adminWorksJsonExisted,
      adminWorksJsonWasDifferent: result.adminWorksJsonWasDifferent
    });
  } catch (err) {
    console.error('Git Data works JSON test failed', err);
    return jsonResponse({
      success: false,
      ...session.body,
      error: publicError(err, 'works_git_data_test_failed')
    }, err.status || 500);
  }
}

export async function onRequestGet() {
  return jsonResponse({
    success: false,
    error: {
      code: 'method_not_allowed',
      message: 'Git Data APIの実験更新はPOSTで実行してください。'
    }
  }, 405);
}

async function syncWorksJsonPair(config, installationToken) {
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
  const srcText = await getBlobText(config, installationToken, srcEntry.sha, worksJsonPath);
  const works = parseWorksJson(srcText, worksJsonPath);
  const nextWorksJson = formatJson(works);

  let adminWorksJsonWasDifferent = true;
  if (adminEntry?.sha) {
    const adminText = await getBlobText(config, installationToken, adminEntry.sha, adminWorksJsonPath);
    adminWorksJsonWasDifferent = adminText !== nextWorksJson;
  }

  const [srcBlob, adminBlob] = await Promise.all([
    createTextBlob(config, installationToken, nextWorksJson),
    createTextBlob(config, installationToken, nextWorksJson)
  ]);

  const nextTree = await createTree(config, installationToken, {
    baseTreeSha,
    entries: [
      { path: worksJsonPath, sha: srcBlob.sha },
      { path: adminWorksJsonPath, sha: adminBlob.sha }
    ]
  });
  const nextCommit = await createCommit(config, installationToken, {
    message: commitMessage,
    treeSha: nextTree.sha,
    parentSha: sourceHeadSha
  });
  await updateBranchRef(config, installationToken, nextCommit.sha);

  return {
    sourceHeadSha,
    commitSha: nextCommit.sha,
    commitUrl: nextCommit.html_url || `https://github.com/${config.owner}/${config.repo}/commit/${nextCommit.sha}`,
    updatedFiles: [worksJsonPath, adminWorksJsonPath],
    adminWorksJsonExisted: Boolean(adminEntry),
    adminWorksJsonWasDifferent
  };
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
