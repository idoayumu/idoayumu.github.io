import { jsonResponse, requireAdminSession } from '../../_shared/access-auth.js';

export async function onRequestGet({ request, env }) {
  const session = await requireAdminSession(request, env);
  return jsonResponse(session.body, session.status);
}
