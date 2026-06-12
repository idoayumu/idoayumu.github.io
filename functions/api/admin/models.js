import { jsonResponse, requireAdminSession } from '../../_shared/access-auth.js';
import { createGitHubInstallationToken, publicError, readGitHubConfig } from '../../_shared/github-app.js';
import {
  addModel,
  deleteModel,
  getModels,
  modelsJsonPath,
  saveModels,
  updateModel
} from '../../_shared/models-store.js';

export async function onRequestPost({ request, env }) {
  return handleModelsMutation(request, env, async (payload, config, installationToken) => {
    const { modelsFile, models } = await getModels(config, installationToken);
    const result = addModel(models, payload?.model || payload);
    if (!result.ok) return mutationError(result);

    const update = await saveModels(config, installationToken, modelsFile, result.nextModels, result.commitMessage);
    return jsonResponse({
      success: true,
      commitUrl: update.commit?.html_url,
      updatedFile: modelsJsonPath,
      modelId: result.model.id
    });
  }, 'models_add_failed');
}

export async function onRequestPut({ request, env }) {
  return handleModelsMutation(request, env, async (payload, config, installationToken) => {
    const modelId = payload?.id;
    const patch = payload?.model || payload;
    const { modelsFile, models } = await getModels(config, installationToken);
    const result = updateModel(models, modelId, patch);
    if (!result.ok) return mutationError(result);

    const update = await saveModels(config, installationToken, modelsFile, result.nextModels, result.commitMessage);
    return jsonResponse({
      success: true,
      commitUrl: update.commit?.html_url,
      updatedFile: modelsJsonPath,
      updatedModelId: result.model.id
    });
  }, 'models_edit_failed');
}

export async function onRequestDelete({ request, env }) {
  return handleModelsMutation(request, env, async (payload, config, installationToken) => {
    const { modelsFile, models } = await getModels(config, installationToken);
    const result = deleteModel(models, payload?.id);
    if (!result.ok) return mutationError(result);

    const update = await saveModels(config, installationToken, modelsFile, result.nextModels, result.commitMessage);
    return jsonResponse({
      success: true,
      commitUrl: update.commit?.html_url,
      updatedFile: modelsJsonPath,
      deletedModelId: payload.id
    });
  }, 'models_delete_failed');
}

export async function onRequestGet() {
  return jsonResponse({
    success: false,
    error: {
      code: 'method_not_allowed',
      message: 'モデルの追加はPOST、編集はPUT、削除はDELETEで実行してください。'
    }
  }, 405);
}

async function handleModelsMutation(request, env, mutate, fallbackErrorCode) {
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
    console.error('Models JSON mutation failed', err);
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
