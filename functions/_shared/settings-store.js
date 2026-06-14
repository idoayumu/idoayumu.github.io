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

  const nextSettings = { ...settings };
  const allowedStringKeys = [
    'adminTestMemo',
    'aboutImage',
    'aboutImageSeason',
    'aboutImageMemo',
    'heroImage',
    'heroImageSeason',
    'heroImageMemo'
  ];
  const allowedNumberKeys = [
    'aboutImageYear',
    'heroImageYear'
  ];

  for (const key of allowedStringKeys) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      nextSettings[key] = trim(input[key]);
    }
  }

  for (const key of allowedNumberKeys) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      const year = Number(input[key]);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return {
          ok: false,
          status: 400,
          error: {
            code: 'invalid_settings_year',
            message: `${key} は2000から2100の整数で指定してください。`
          }
        };
      }
      nextSettings[key] = year;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, 'aboutImageHistory')) {
    if (!Array.isArray(input.aboutImageHistory)) {
      return invalidArray('aboutImageHistory');
    }
    nextSettings.aboutImageHistory = input.aboutImageHistory;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'heroImageHistory')) {
    if (!Array.isArray(input.heroImageHistory)) {
      return invalidArray('heroImageHistory');
    }
    nextSettings.heroImageHistory = input.heroImageHistory;
  }

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

function invalidArray(key) {
  return {
    ok: false,
    status: 400,
    error: {
      code: 'invalid_settings_array',
      message: `${key} は配列で指定してください。`
    }
  };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
