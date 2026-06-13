import { jsonResponse, requireAdminSession } from '../../_shared/access-auth.js';
import {
  createGitHubInstallationToken,
  getContentFile,
  parseJsonContent,
  publicError,
  readGitHubConfig,
  worksJsonPath
} from '../../_shared/github-app.js';

const targetBranch = 'dev';

export async function onRequestGet({ request, env }) {
  const session = await requireAdminSession(request, env);
  if (!session.ok) return jsonResponse(session.body, session.status);

  const config = readGitHubConfig(env);
  if (!config.ok) {
    return jsonResponse({
      success: false,
      ...session.body,
      branch: targetBranch,
      source: 'github',
      error: config.error
    }, 500);
  }

  try {
    const targetConfig = {
      ...config.value,
      branch: targetBranch
    };
    const installationToken = await createGitHubInstallationToken(targetConfig);
    const file = await getContentFile(targetConfig, installationToken, worksJsonPath);
    const works = parseJsonContent(file, worksJsonPath);

    if (!Array.isArray(works)) {
      return jsonResponse({
        success: false,
        ...session.body,
        branch: targetBranch,
        source: 'github',
        error: {
          code: 'invalid_works_json',
          message: `${worksJsonPath} が配列ではありません。`
        }
      }, 500);
    }

    return jsonResponse({
      success: true,
      ...session.body,
      branch: targetBranch,
      source: 'github',
      works
    });
  } catch (err) {
    console.error('Works dev read failed', err);
    return jsonResponse({
      success: false,
      ...session.body,
      branch: targetBranch,
      source: 'github',
      error: publicError(err, 'works_dev_read_failed')
    }, err.status || 500);
  }
}
