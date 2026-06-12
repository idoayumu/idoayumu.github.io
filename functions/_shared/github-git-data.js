const gitObjectModeFile = '100644';
const gitObjectTypeBlob = 'blob';

export async function getBranchRef(config, installationToken) {
  return githubFetch(
    config,
    installationToken,
    `/git/ref/heads/${encodeGitHubPath(config.branch)}`
  );
}

export async function getGitCommit(config, installationToken, commitSha) {
  return githubFetch(config, installationToken, `/git/commits/${encodeURIComponent(commitSha)}`);
}

export async function getRecursiveTree(config, installationToken, treeSha) {
  return githubFetch(
    config,
    installationToken,
    `/git/trees/${encodeURIComponent(treeSha)}?recursive=1`
  );
}

export function findTreeBlob(tree, filePath) {
  return (tree?.tree || []).find((entry) => (
    entry?.path === filePath && entry.type === gitObjectTypeBlob
  )) || null;
}

export async function getBlobText(config, installationToken, blobSha, filePath) {
  const blob = await githubFetch(config, installationToken, `/git/blobs/${encodeURIComponent(blobSha)}`);
  if (blob.encoding !== 'base64' || typeof blob.content !== 'string') {
    const err = new Error(`${filePath} のblob contentを取得できませんでした。`);
    err.code = 'github_blob_content_missing';
    throw err;
  }
  return base64DecodeText(blob.content);
}

export async function createTextBlob(config, installationToken, content) {
  return githubFetch(config, installationToken, '/git/blobs', {
    method: 'POST',
    body: JSON.stringify({
      content,
      encoding: 'utf-8'
    })
  });
}

export async function createBase64Blob(config, installationToken, base64Content) {
  return githubFetch(config, installationToken, '/git/blobs', {
    method: 'POST',
    body: JSON.stringify({
      content: base64Content,
      encoding: 'base64'
    })
  });
}

export async function createTree(config, installationToken, { baseTreeSha, entries }) {
  return githubFetch(config, installationToken, '/git/trees', {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: entries.map((entry) => ({
        path: entry.path,
        mode: gitObjectModeFile,
        type: gitObjectTypeBlob,
        sha: entry.sha ?? null
      }))
    })
  });
}

export async function createCommit(config, installationToken, { message, treeSha, parentSha }) {
  return githubFetch(config, installationToken, '/git/commits', {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: treeSha,
      parents: [parentSha]
    })
  });
}

export async function updateBranchRef(config, installationToken, commitSha) {
  try {
    return await githubFetch(
      config,
      installationToken,
      `/git/refs/heads/${encodeGitHubPath(config.branch)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          sha: commitSha,
          force: false
        })
      }
    );
  } catch (err) {
    if (err.status === 409 || err.status === 422) {
      err.code = 'branch_conflict';
      err.message = 'GitHub上のbranchが更新されています。画面を再読み込みしてから再実行してください。';
    }
    throw err;
  }
}

async function githubFetch(config, bearerToken, path, init = {}) {
  const resp = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${bearerToken}`,
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'kokei-note-admin',
      ...(init.headers || {})
    }
  });
  const text = await resp.text();
  const body = text ? JSON.parse(text) : {};

  if (!resp.ok) {
    const err = new Error(body.message || `GitHub Git Data API request failed: ${resp.status}`);
    err.status = resp.status;
    err.github = {
      status: resp.status,
      message: body.message,
      documentationUrl: body.documentation_url
    };
    throw err;
  }

  return body;
}

function encodeGitHubPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function base64DecodeText(value) {
  const binary = atob(String(value).replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}
