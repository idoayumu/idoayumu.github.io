import { jsonResponse, requireAdminSession } from '../../_shared/access-auth.js';
import {
  createGitHubInstallationToken,
  getContentFile,
  modelsJsonPath,
  parseJsonContent,
  publicError,
  readGitHubConfig
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
    const file = await getContentFile(targetConfig, installationToken, modelsJsonPath);
    const models = parseJsonContent(file, modelsJsonPath);

    if (!Array.isArray(models)) {
      return jsonResponse({
        success: false,
        ...session.body,
        branch: targetBranch,
        source: 'github',
        error: {
          code: 'invalid_models_json',
          message: `${modelsJsonPath} が配列ではありません。`
        }
      }, 500);
    }

    return jsonResponse({
      success: true,
      ...session.body,
      branch: targetBranch,
      source: 'github',
      models
    });
  } catch (err) {
    console.error('Models dev read failed', err);
    return jsonResponse({
      success: false,
      ...session.body,
      branch: targetBranch,
      source: 'github',
      error: publicError(err, 'models_dev_read_failed')
    }, err.status || 500);
  }
}
