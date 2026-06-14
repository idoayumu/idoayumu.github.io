import { jsonResponse, requireAdminSession } from '../../_shared/access-auth.js';
import {
  createGitHubInstallationToken,
  formatJson,
  publicError,
  readGitHubConfig
} from '../../_shared/github-app.js';
import {
  createCommit,
  createTextBlob,
  createTree,
  getBlobText,
  getBranchRef,
  getGitCommit,
  getRecursiveTree,
  updateBranchRef
} from '../../_shared/github-git-data.js';

const targetBranch = 'dev';
const pendingTypes = {
  works: {
    label: '作品',
    singular: 'work',
    root: 'tools/admin/uploads/works/pending',
    discardRoot: 'tools/admin/uploads/works/discarded',
    jsonName: 'work.json',
    idKey: 'workId',
    titleKey: 'title'
  },
  models: {
    label: 'モデル',
    singular: 'model',
    root: 'tools/admin/uploads/models/pending',
    discardRoot: 'tools/admin/uploads/models/discarded',
    jsonName: 'model.json',
    idKey: 'modelId',
    titleKey: 'name'
  },
  modelImages: {
    label: 'モデル画像',
    singular: 'model image',
    root: 'tools/admin/uploads/models/replace-pending',
    discardRoot: 'tools/admin/uploads/models/replace-discarded',
    jsonName: 'model.json',
    idKey: 'modelId',
    titleKey: 'id'
  },
  settings: {
    label: '設定',
    singular: 'setting',
    root: 'tools/admin/uploads/settings/pending',
    discardRoot: 'tools/admin/uploads/settings/discarded',
    jsonName: 'settings.json',
    idKey: 'settingsId',
    titleKey: 'title'
  }
};

export async function onRequestGet({ request, env }) {
  const session = await requireAdminSession(request, env);
  if (!session.ok) return jsonResponse(session.body, session.status);

  const config = readGitHubConfig(env);
  if (!config.ok) {
    return jsonResponse({
      success: false,
      ...session.body,
      branch: targetBranch,
      error: config.error
    }, 500);
  }

  try {
    const targetConfig = withTargetBranch(config.value);
    const installationToken = await createGitHubInstallationToken(targetConfig);
    const context = await readBranchTree(targetConfig, installationToken);
    const pending = await collectPendingStatus(targetConfig, installationToken, context.tree);

    return jsonResponse({
      success: true,
      ...session.body,
      branch: targetConfig.branch,
      source: 'github',
      pending,
      count: pending.works.length + pending.models.length + pending.settings.length
    });
  } catch (err) {
    console.error('Pending status failed', err);
    return jsonResponse({
      success: false,
      ...session.body,
      branch: targetBranch,
      error: publicError(err, 'pending_status_failed')
    }, err.status || 500);
  }
}

export async function onRequestPost({ request, env }) {
  const session = await requireAdminSession(request, env);
  if (!session.ok) return jsonResponse(session.body, session.status);

  const config = readGitHubConfig(env);
  if (!config.ok) {
    return jsonResponse({
      success: false,
      ...session.body,
      branch: targetBranch,
      error: config.error
    }, 500);
  }

  try {
    const targetConfig = withTargetBranch(config.value);
    const payload = await parsePendingActionRequest(request);
    const installationToken = await createGitHubInstallationToken(targetConfig);
    const result = await retryPending(targetConfig, installationToken, payload);

    return jsonResponse({
      success: true,
      ...session.body,
      branch: targetConfig.branch,
      action: 'retry',
      ...result
    });
  } catch (err) {
    console.error('Pending retry failed', err);
    return jsonResponse({
      success: false,
      ...session.body,
      branch: targetBranch,
      error: publicError(err, 'pending_retry_failed')
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
      branch: targetBranch,
      error: config.error
    }, 500);
  }

  try {
    const targetConfig = withTargetBranch(config.value);
    const payload = await parsePendingActionRequest(request);
    const installationToken = await createGitHubInstallationToken(targetConfig);
    const result = await discardPending(targetConfig, installationToken, payload);

    return jsonResponse({
      success: true,
      ...session.body,
      branch: targetConfig.branch,
      action: 'discard',
      ...result
    });
  } catch (err) {
    console.error('Pending discard failed', err);
    return jsonResponse({
      success: false,
      ...session.body,
      branch: targetBranch,
      error: publicError(err, 'pending_discard_failed')
    }, err.status || 500);
  }
}

async function retryPending(config, installationToken, { type, id }) {
  const typeConfig = pendingTypes[type];
  if (type === 'settings') {
    throw httpError(400, 'pending_retry_not_supported', '設定pendingの再試行はまだ対応していません。内容を確認し、不要であれば破棄してください。');
  }
  const context = await readBranchTree(config, installationToken);
  const group = getPendingGroup(context.tree, typeConfig, id);
  if (!group.entries.length) {
    throw httpError(404, 'pending_not_found', `${typeConfig.label}pendingが見つかりません: ${id}`);
  }

  const jsonStatus = await readPendingJson(config, installationToken, typeConfig, group);
  if (!jsonStatus.ok) {
    throw httpError(400, 'pending_json_invalid', `${typeConfig.label}pendingのJSONに問題があります。再試行前に内容を確認するか、破棄してください。`, {
      jsonError: jsonStatus.error
    });
  }

  const markerPath = `${typeConfig.root}/${id}/retry-${timestampForPath()}.json`;
  const markerBlob = await createTextBlob(config, installationToken, formatJson({
    action: 'retry',
    type,
    id,
    requestedAt: new Date().toISOString(),
    note: '管理画面からpending再試行を要求しました。'
  }));

  const nextTree = await createTree(config, installationToken, {
    baseTreeSha: context.baseTreeSha,
    entries: [
      { path: markerPath, sha: markerBlob.sha }
    ]
  });
  const nextCommit = await createCommit(config, installationToken, {
    message: `Retry pending ${typeConfig.singular} ${id}`,
    treeSha: nextTree.sha,
    parentSha: context.sourceHeadSha
  });
  await updateBranchRef(config, installationToken, nextCommit.sha);

  return {
    pendingType: type,
    pendingId: id,
    commitSha: nextCommit.sha,
    commitUrl: commitUrl(config, nextCommit.sha, nextCommit.html_url),
    updatedFiles: [markerPath],
    message: 'pending内に再試行マーカーを保存しました。GitHub Actionsが再実行されます。'
  };
}

async function discardPending(config, installationToken, { type, id }) {
  const typeConfig = pendingTypes[type];
  const context = await readBranchTree(config, installationToken);
  const group = getPendingGroup(context.tree, typeConfig, id);
  if (!group.entries.length) {
    throw httpError(404, 'pending_not_found', `${typeConfig.label}pendingが見つかりません: ${id}`);
  }

  const backupRoot = `${typeConfig.discardRoot}/${id}/${timestampForPath()}`;
  const backupEntries = group.entries
    .filter((entry) => entry.type === 'blob' && entry.sha)
    .map((entry) => ({
      path: `${backupRoot}/${entry.path.slice(group.prefix.length + 1)}`,
      sha: entry.sha
    }));
  const deleteEntries = group.entries
    .filter((entry) => entry.type === 'blob')
    .map((entry) => ({
      path: entry.path,
      sha: null
    }));

  const nextTree = await createTree(config, installationToken, {
    baseTreeSha: context.baseTreeSha,
    entries: [
      ...backupEntries,
      ...deleteEntries
    ]
  });
  const nextCommit = await createCommit(config, installationToken, {
    message: `Discard pending ${typeConfig.singular} ${id}`,
    treeSha: nextTree.sha,
    parentSha: context.sourceHeadSha
  });
  await updateBranchRef(config, installationToken, nextCommit.sha);

  return {
    pendingType: type,
    pendingId: id,
    commitSha: nextCommit.sha,
    commitUrl: commitUrl(config, nextCommit.sha, nextCommit.html_url),
    deletedFiles: deleteEntries.map((entry) => entry.path),
    backupFiles: backupEntries.map((entry) => entry.path),
    message: 'pendingだけを破棄しました。本体JSONは変更していません。退避コピーを残しています。'
  };
}

async function collectPendingStatus(config, installationToken, tree) {
  return {
    works: await collectTypePendingStatus(config, installationToken, tree, 'works'),
    models: await collectTypePendingStatus(config, installationToken, tree, 'models'),
    modelImages: await collectTypePendingStatus(config, installationToken, tree, 'modelImages'),
    settings: await collectTypePendingStatus(config, installationToken, tree, 'settings')
  };
}

async function collectTypePendingStatus(config, installationToken, tree, type) {
  const typeConfig = pendingTypes[type];
  const groups = groupPendingEntries(tree, typeConfig);
  const items = [];

  for (const [id, group] of groups) {
    const jsonStatus = await readPendingJson(config, installationToken, typeConfig, group);
    const original = group.entries.find((entry) => /\/original\.(jpe?g|png)$/i.test(entry.path));
    const retryMarkers = group.entries.filter((entry) => /\/retry-[^/]+\.json$/i.test(entry.path));
    const files = group.entries
      .filter((entry) => entry.type === 'blob')
      .map((entry) => entry.path)
      .sort();

    const hasJson = Boolean(group.jsonEntry);
    const hasOriginal = Boolean(original);
    const status = statusForPendingItem({ hasJson, hasOriginal, jsonStatus });

    items.push({
      type,
      id,
      label: typeConfig.label,
      status,
      statusLabel: pendingStatusLabel(status),
      title: jsonStatus.value?.[typeConfig.titleKey] || '',
      jsonValid: jsonStatus.ok,
      jsonError: jsonStatus.error,
      hasOriginal,
      canRetry: type !== 'settings',
      originalFile: original?.path || '',
      retryCount: retryMarkers.length,
      files,
      data: jsonStatus.ok ? jsonStatus.value : null
    });
  }

  return items.sort((a, b) => a.id.localeCompare(b.id));
}

function groupPendingEntries(tree, typeConfig) {
  const groups = new Map();
  const prefix = `${typeConfig.root}/`;
  for (const entry of tree?.tree || []) {
    if (!entry?.path?.startsWith(prefix)) continue;
    const rest = entry.path.slice(prefix.length);
    const [id] = rest.split('/');
    if (!id) continue;
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        prefix: `${typeConfig.root}/${id}`,
        entries: [],
        jsonEntry: null
      });
    }
    const group = groups.get(id);
    group.entries.push(entry);
    if (entry.path === `${typeConfig.root}/${id}/${typeConfig.jsonName}` && entry.type === 'blob') {
      group.jsonEntry = entry;
    }
  }
  return groups;
}

function getPendingGroup(tree, typeConfig, id) {
  const group = groupPendingEntries(tree, typeConfig).get(id);
  return group || {
    id,
    prefix: `${typeConfig.root}/${id}`,
    entries: [],
    jsonEntry: null
  };
}

async function readPendingJson(config, installationToken, typeConfig, group) {
  if (!group.jsonEntry?.sha) {
    return {
      ok: false,
      value: null,
      error: `${typeConfig.jsonName} が見つかりません。`
    };
  }

  try {
    const text = await getBlobText(config, installationToken, group.jsonEntry.sha, group.jsonEntry.path);
    return {
      ok: true,
      value: JSON.parse(text),
      error: ''
    };
  } catch (err) {
    return {
      ok: false,
      value: null,
      error: err.message || `${typeConfig.jsonName} を解析できませんでした。`
    };
  }
}

function statusForPendingItem({ hasJson, hasOriginal, jsonStatus }) {
  if (!hasJson || !hasOriginal || !jsonStatus.ok) return 'needs_attention';
  return 'waiting';
}

function pendingStatusLabel(status) {
  if (status === 'needs_attention') return '失敗の可能性あり';
  return '反映待ち';
}

async function readBranchTree(config, installationToken) {
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
  return { sourceHeadSha, baseTreeSha, tree };
}

async function parsePendingActionRequest(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw httpError(400, 'invalid_json_request', 'リクエストJSONを解析できませんでした。');
  }

  const type = String(body?.type || '').trim();
  const id = String(body?.id || '').trim();
  if (!pendingTypes[type]) {
    throw httpError(400, 'invalid_pending_type', 'pending種別は works または models を指定してください。');
  }
  if (!id) {
    throw httpError(400, 'missing_pending_id', 'pending IDが不足しています。');
  }
  return { type, id };
}

function withTargetBranch(config) {
  return {
    ...config,
    branch: targetBranch
  };
}

function timestampForPath() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function commitUrl(config, sha, fallback) {
  return fallback || `https://github.com/${config.owner}/${config.repo}/commit/${sha}`;
}

function httpError(status, code, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}
