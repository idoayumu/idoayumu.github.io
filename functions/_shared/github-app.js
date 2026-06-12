export const worksJsonPath = 'src/data/works.json';
export const modelsJsonPath = 'src/data/models.json';

export function readGitHubConfig(env) {
  const value = {
    appId: String(env.GITHUB_APP_ID || '').trim(),
    installationId: String(env.GITHUB_INSTALLATION_ID || '').trim(),
    privateKey: normalizePrivateKey(env.GITHUB_PRIVATE_KEY),
    owner: String(env.GITHUB_OWNER || '').trim(),
    repo: String(env.GITHUB_REPO || '').trim(),
    branch: String(env.GITHUB_BRANCH || 'main').trim()
  };

  const missing = Object.entries(value)
    .filter(([, item]) => !item)
    .map(([key]) => key);

  if (missing.length) {
    return {
      ok: false,
      error: {
        code: 'missing_github_config',
        message: 'GitHub Appの環境変数が不足しています。',
        missing
      }
    };
  }

  return { ok: true, value };
}

export async function createGitHubInstallationToken(config) {
  const appJwt = await createGitHubAppJwt(config.appId, config.privateKey);
  return createInstallationToken(config.installationId, appJwt);
}

export async function getRepo(config, installationToken) {
  return githubFetch(`/repos/${config.owner}/${config.repo}`, installationToken);
}

export async function getContentFile(config, installationToken, filePath) {
  return githubFetch(
    `/repos/${config.owner}/${config.repo}/contents/${encodeGitHubPath(filePath)}?ref=${encodeURIComponent(config.branch)}`,
    installationToken
  );
}

export async function updateContentFile(config, installationToken, { filePath, content, sha, message }) {
  return githubFetch(
    `/repos/${config.owner}/${config.repo}/contents/${encodeGitHubPath(filePath)}`,
    installationToken,
    {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: base64EncodeText(content),
        sha,
        branch: config.branch
      })
    }
  );
}

export function parseJsonContent(file, label) {
  if (!file?.content) {
    const err = new Error(`${label} のcontentを取得できませんでした。`);
    err.code = 'github_content_missing';
    throw err;
  }

  try {
    return JSON.parse(base64DecodeText(file.content));
  } catch (err) {
    err.code = 'github_json_parse_failed';
    err.message = `${label} のJSONを解析できませんでした: ${err.message}`;
    throw err;
  }
}

export function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function publicError(err, fallbackCode = 'github_request_failed') {
  return {
    code: err.code || fallbackCode,
    message: err.message || 'GitHub APIリクエストに失敗しました。',
    github: err.github
  };
}

function normalizePrivateKey(value) {
  return String(value || '').trim().replace(/\\n/g, '\n');
}

async function createGitHubAppJwt(appId, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncodeJson({ alg: 'RS256', typ: 'JWT' });
  const payload = base64UrlEncodeJson({
    iat: now - 60,
    exp: now + 9 * 60,
    iss: appId
  });
  const unsigned = `${header}.${payload}`;
  const key = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

async function importPrivateKey(privateKeyPem) {
  const der = pemToDer(privateKeyPem);
  const pkcs8 = privateKeyPem.includes('BEGIN RSA PRIVATE KEY')
    ? wrapPkcs1PrivateKey(der)
    : der;

  return crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function createInstallationToken(installationId, appJwt) {
  const token = await githubFetch(`/app/installations/${installationId}/access_tokens`, appJwt, {
    method: 'POST'
  });

  if (!token?.token) {
    const err = new Error('Installation token was not returned by GitHub.');
    err.code = 'installation_token_missing';
    throw err;
  }

  return token.token;
}

async function githubFetch(path, bearerToken, init = {}) {
  const resp = await fetch(`https://api.github.com${path}`, {
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
    const err = new Error(body.message || `GitHub API request failed: ${resp.status}`);
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

function pemToDer(pem) {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  return base64ToBytes(base64);
}

function wrapPkcs1PrivateKey(pkcs1) {
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const algorithm = new Uint8Array([
    0x30, 0x0d,
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
    0x05, 0x00
  ]);
  const privateKey = derElement(0x04, pkcs1);
  return derElement(0x30, concatBytes(version, algorithm, privateKey));
}

function derElement(tag, body) {
  return concatBytes(new Uint8Array([tag]), derLength(body.length), body);
}

function derLength(length) {
  if (length < 0x80) return new Uint8Array([length]);

  const bytes = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function concatBytes(...arrays) {
  const total = arrays.reduce((sum, item) => sum + item.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  arrays.forEach((item) => {
    result.set(item, offset);
    offset += item.length;
  });
  return result;
}

function base64UrlEncodeJson(value) {
  return base64UrlEncodeText(JSON.stringify(value));
}

function base64UrlEncodeText(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64EncodeText(value) {
  return base64UrlUnsafeEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlUnsafeEncodeBytes(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64DecodeText(value) {
  const binary = atob(String(value).replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
