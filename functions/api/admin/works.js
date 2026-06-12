import { jsonResponse, requireAdminSession } from '../../_shared/access-auth.js';
import { createGitHubInstallationToken, publicError, readGitHubConfig } from '../../_shared/github-app.js';
import {
  addWork,
  deleteWork,
  getWorks,
  getWorksAndModels,
  saveWorks,
  updateWork,
  worksJsonPath
} from '../../_shared/works-store.js';

export async function onRequestPost({ request, env }) {
  return handleWorksMutation(request, env, async (payload, config, installationToken) => {
    const { worksFile, works, models } = await getWorksAndModels(config, installationToken);
    const result = addWork(works, models, payload?.work || payload);
    if (!result.ok) return mutationError(result);

    const update = await saveWorks(config, installationToken, worksFile, result.nextWorks, result.commitMessage);
    return jsonResponse({
      success: true,
      commitUrl: update.commit?.html_url,
      updatedFile: worksJsonPath,
      workId: result.work.id
    });
  }, 'works_update_failed');
}

export async function onRequestPut({ request, env }) {
  return handleWorksMutation(request, env, async (payload, config, installationToken) => {
    const workId = payload?.id;
    const patch = payload?.work || payload;
    const { worksFile, works, models } = await getWorksAndModels(config, installationToken);
    const result = updateWork(works, models, workId, patch);
    if (!result.ok) return mutationError(result);

    const update = await saveWorks(config, installationToken, worksFile, result.nextWorks, result.commitMessage);
    return jsonResponse({
      success: true,
      commitUrl: update.commit?.html_url,
      updatedFile: worksJsonPath,
      updatedWorkId: result.work.id
    });
  }, 'works_edit_failed');
}

export async function onRequestDelete({ request, env }) {
  return handleWorksMutation(request, env, async (payload, config, installationToken) => {
    const { worksFile, works } = await getWorks(config, installationToken);
    const result = deleteWork(works, payload?.id);
    if (!result.ok) return mutationError(result);

    const update = await saveWorks(config, installationToken, worksFile, result.nextWorks, result.commitMessage);
    return jsonResponse({
      success: true,
      commitUrl: update.commit?.html_url,
      updatedFile: worksJsonPath,
      deletedWorkId: payload.id
    });
  }, 'works_delete_failed');
}

export async function onRequestGet() {
  return jsonResponse({
    success: false,
    error: {
      code: 'method_not_allowed',
      message: '作品の追加はPOST、編集はPUT、削除はDELETEで実行してください。'
    }
  }, 405);
}

async function handleWorksMutation(request, env, mutate, fallbackErrorCode) {
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

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({
      success: false,
      ...session.body,
      error: {
        code: 'invalid_json',
        message: 'リクエストJSONを解析できませんでした。'
      }
    }, 400);
  }

  try {
    const installationToken = await createGitHubInstallationToken(config.value);
    return await mutate(payload, config.value, installationToken);
  } catch (err) {
    console.error('Works JSON mutation failed', err);
    return jsonResponse({
      success: false,
      ...session.body,
      error: publicError(err, fallbackErrorCode)
    }, err.status || 500);
  }
}

function mutationError(result) {
  return jsonResponse({
    success: false,
    error: result.error
  }, result.status || 400);
}
