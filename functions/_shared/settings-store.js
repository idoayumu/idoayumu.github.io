import {
  formatJson,
  getContentFile,
  parseJsonContent,
  settingsJsonPath,
  updateContentFile
} from './github-app.js';

export { settingsJsonPath };

export async function getSettings(config, installationToken) {
  const settingsFile = await getContentFile(config, installationToken, settingsJsonPath);
  const settings = parseJsonContent(settingsFile, settingsJsonPath);
  assertSettingsObject(settings);
  return { settingsFile, settings };
}

export function updateSettings(settings, input) {
  if (!isObject(input)) {
    return {
      ok: false,
      status: 400,
      error: {
        code: 'invalid_settings_payload',
        message: '設定データが不正です。'
      }
    };
  }

  const nextSettings = {
    ...settings,
    adminTestMemo: trim(input.adminTestMemo)
  };

  return {
    ok: true,
    nextSettings,
    commitMessage: 'Update site settings'
  };
}

export async function saveSettings(config, installationToken, settingsFile, nextSettings, message) {
  return updateContentFile(config, installationToken, {
    filePath: settingsJsonPath,
    content: formatJson(nextSettings),
    sha: settingsFile.sha,
    message
  });
}

function assertSettingsObject(settings) {
  if (!isObject(settings)) {
    const err = new Error('現在のsite-settings.jsonがオブジェクトではありません。');
    err.code = 'invalid_settings_json';
    throw err;
  }
}

function trim(value) {
  return String(value || '').trim();
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
