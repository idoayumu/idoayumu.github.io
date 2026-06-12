import { jsonResponse, requireAdminSession } from '../../_shared/access-auth.js';
import { createGitHubInstallationToken, publicError, readGitHubConfig } from '../../_shared/github-app.js';
import {
  getSettings,
  saveSettings,
  settingsJsonPath,
  updateSettings
} from '../../_shared/settings-store.js';

export async function onRequestGet({ request, env }) {
  const ready = await prepareSettingsRequest(request, env);
  if (!ready.ok) return ready.response;

  try {
    const { settings } = await getSettings(ready.config, ready.installationToken);
    return jsonResponse({
      success: true,
      updatedFile: settingsJsonPath,
      settings
    });
  } catch (err) {
    console.error('Settings JSON get failed', err);
    return jsonResponse({
      success: false,
      ...ready.session.body,
      error: publicError(err, 'settings_get_failed')
    }, err.status || 500);
  }
}

export async function onRequestPut({ request, env }) {
  const ready = await prepareSettingsRequest(request, env);
  if (!ready.ok) return ready.response;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({
      success: false,
      ...ready.session.body,
      error: {
        code: 'invalid_json',
        message: 'リクエストJSONを解析できませんでした。'
      }
    }, 400);
  }

  try {
    const { settingsFile, settings } = await getSettings(ready.config, ready.installationToken);
    const result = updateSettings(settings, payload?.settings || payload);
    if (!result.ok) {
      return jsonResponse({
        success: false,
        error: result.error
      }, result.status || 400);
    }

    const update = await saveSettings(
      ready.config,
      ready.installationToken,
      settingsFile,
      result.nextSettings,
      result.commitMessage
    );
    return jsonResponse({
      success: true,
      commitUrl: update.commit?.html_url,
      updatedFile: settingsJsonPath
    });
  } catch (err) {
    console.error('Settings JSON update failed', err);
    return jsonResponse({
      success: false,
      ...ready.session.body,
      error: publicError(err, 'settings_update_failed')
    }, err.status || 500);
  }
}

async function prepareSettingsRequest(request, env) {
  const session = await requireAdminSession(request, env);
  if (!session.ok) {
    return { ok: false, response: jsonResponse(session.body, session.status) };
  }

  const config = readGitHubConfig(env);
  if (!config.ok) {
    return {
      ok: false,
      response: jsonResponse({
        success: false,
        ...session.body,
        error: {
          ...config.error,
          code: 'missing_settings_config'
        }
      }, 500)
    };
  }

  try {
    const installationToken = await createGitHubInstallationToken(config.value);
    return {
      ok: true,
      session,
      config: config.value,
      installationToken
    };
  } catch (err) {
    console.error('Settings GitHub token preparation failed', err);
    return {
      ok: false,
      response: jsonResponse({
        success: false,
        ...session.body,
        error: publicError(err, 'settings_auth_failed')
      }, err.status || 500)
    };
  }
}
