import { jsonResponse, requireAdminSession } from '../../../_shared/access-auth.js';
import {
  createGitHubInstallationToken,
  getContentFile,
  getRepo,
  publicError,
  readGitHubConfig,
  worksJsonPath
} from '../../../_shared/github-app.js';

export async function onRequestGet({ request, env }) {
  const session = await requireAdminSession(request, env);
  if (!session.ok) {
    return jsonResponse({
      ...session.body,
      github: {
        connected: false
      }
    }, session.status);
  }

  const config = readGitHubConfig(env);
  if (!config.ok) {
    return jsonResponse({
      ...session.body,
      github: {
        connected: false
      },
      error: config.error
    }, 500);
  }

  try {
    const installationToken = await createGitHubInstallationToken(config.value);
    const [repo, worksFile] = await Promise.all([
      getRepo(config.value, installationToken),
      getContentFile(config.value, installationToken, worksJsonPath)
    ]);

    const worksJsonReadable = Boolean(worksFile?.type === 'file' && worksFile?.sha);

    return jsonResponse({
      ...session.body,
      github: {
        connected: true,
        repo: repo.full_name || `${config.value.owner}/${config.value.repo}`,
        branch: config.value.branch,
        defaultBranch: repo.default_branch,
        worksJsonReadable,
        worksJsonSha: worksFile.sha
      }
    });
  } catch (err) {
    console.error('GitHub App status check failed', err);
    return jsonResponse({
      ...session.body,
      github: {
        connected: false,
        repo: `${config.value.owner}/${config.value.repo}`,
        branch: config.value.branch,
        worksJsonReadable: false
      },
      error: publicError(err)
    }, err.status || 500);
  }
}
