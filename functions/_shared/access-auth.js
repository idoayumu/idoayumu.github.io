export const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders
  });
}

export async function requireAdminSession(request, env) {
  const allowedEmail = normalizeEmail(env.ADMIN_ALLOWED_EMAIL);
  const teamDomain = normalizeTeamDomain(env.CF_ACCESS_TEAM_DOMAIN);
  const audience = String(env.CF_ACCESS_AUD || '').trim();
  const token = getAccessToken(request);

  if (!token) {
    return {
      ok: false,
      status: 401,
      body: {
        authenticated: false,
        canSave: false,
        mode: 'cloudflare-access'
      }
    };
  }

  if (!allowedEmail || !teamDomain || !audience) {
    return {
      ok: false,
      status: 500,
      body: {
        authenticated: false,
        canSave: false,
        mode: 'cloudflare-access',
        message: 'Cloudflare Accessの環境変数が不足しています。'
      }
    };
  }

  try {
    const payload = await verifyAccessJwt(token, { teamDomain, audience });
    const email = normalizeEmail(payload.email);
    const canSave = Boolean(email && email === allowedEmail);

    return {
      ok: canSave,
      status: canSave ? 200 : 403,
      body: {
        authenticated: Boolean(email),
        email: email || undefined,
        canSave,
        mode: 'cloudflare-access'
      }
    };
  } catch (err) {
    console.error('Cloudflare Access JWT verification failed', err);
    return {
      ok: false,
      status: 403,
      body: {
        authenticated: false,
        canSave: false,
        mode: 'cloudflare-access'
      }
    };
  }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeTeamDomain(value) {
  const text = String(value || '').trim().replace(/\/+$/, '');
  if (!text) return '';
  return text.startsWith('https://') ? text : `https://${text}`;
}

function getAccessToken(request) {
  const headerToken = request.headers.get('cf-access-jwt-assertion');
  if (headerToken) return headerToken.trim();

  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function verifyAccessJwt(token, { teamDomain, audience }) {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error('Invalid JWT format');
  }

  const header = JSON.parse(base64UrlToText(encodedHeader));
  const payload = JSON.parse(base64UrlToText(encodedPayload));

  if (header.alg !== 'RS256') {
    throw new Error('Unexpected JWT algorithm');
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('JWT expired');
  if (payload.nbf && payload.nbf > now) throw new Error('JWT not active yet');
  if (payload.iss !== teamDomain) throw new Error('Unexpected JWT issuer');
  if (!audienceMatches(payload.aud, audience)) throw new Error('Unexpected JWT audience');

  const jwk = await findSigningKey(`${teamDomain}/cdn-cgi/access/certs`, header.kid);
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    base64UrlToBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );

  if (!verified) throw new Error('Invalid JWT signature');
  return payload;
}

async function findSigningKey(certsUrl, kid) {
  const resp = await fetch(certsUrl, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`Unable to fetch Access certs: ${resp.status}`);
  const jwks = await resp.json();
  const key = (jwks.keys || []).find((item) => item.kid === kid);
  if (!key) throw new Error('Access signing key not found');
  return key;
}

function audienceMatches(actual, expected) {
  if (Array.isArray(actual)) return actual.includes(expected);
  return actual === expected;
}

function base64UrlToText(value) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
