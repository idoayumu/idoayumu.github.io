import { jsonResponse, requireAdminSession } from '../../_shared/access-auth.js';
import {
  createGitHubInstallationToken,
  formatJson,
  getContentFile,
  modelsJsonPath,
  parseJsonContent,
  publicError,
  readGitHubConfig,
  updateContentFile,
  worksJsonPath
} from '../../_shared/github-app.js';

export async function onRequestPost({ request, env }) {
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

  const normalizedWork = normalizeWork(payload?.work || payload);
  if (!normalizedWork.ok) {
    return jsonResponse({
      success: false,
      ...session.body,
      error: normalizedWork.error
    }, 400);
  }

  try {
    const installationToken = await createGitHubInstallationToken(config.value);
    const [worksFile, modelsFile] = await Promise.all([
      getContentFile(config.value, installationToken, worksJsonPath),
      getContentFile(config.value, installationToken, modelsJsonPath)
    ]);
    const works = parseJsonContent(worksFile, worksJsonPath);
    const models = parseJsonContent(modelsFile, modelsJsonPath);

    if (!Array.isArray(works)) {
      return jsonResponse({
        success: false,
        ...session.body,
        error: {
          code: 'invalid_works_json',
          message: '現在のworks.jsonが配列ではありません。'
        }
      }, 500);
    }

    const validation = validateNewWork(normalizedWork.value, works, models);
    if (!validation.ok) {
      return jsonResponse({
        success: false,
        ...session.body,
        error: validation.error
      }, validation.status);
    }

    const nextWorks = [...works, normalizedWork.value];
    const message = `Add work ${normalizedWork.value.id}`;
    const update = await updateContentFile(config.value, installationToken, {
      filePath: worksJsonPath,
      content: formatJson(nextWorks),
      sha: worksFile.sha,
      message
    });

    return jsonResponse({
      success: true,
      commitUrl: update.commit?.html_url,
      updatedFile: worksJsonPath,
      workId: normalizedWork.value.id
    });
  } catch (err) {
    console.error('Works JSON update failed', err);
    return jsonResponse({
      success: false,
      ...session.body,
      error: publicError(err, 'works_update_failed')
    }, err.status || 500);
  }
}

export async function onRequestDelete({ request, env }) {
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

  const workId = trim(payload?.id);
  if (!workId) {
    return jsonResponse({
      success: false,
      ...session.body,
      error: {
        code: 'missing_work_id',
        message: '削除対象の作品IDが不足しています。'
      }
    }, 400);
  }

  try {
    const installationToken = await createGitHubInstallationToken(config.value);
    const worksFile = await getContentFile(config.value, installationToken, worksJsonPath);
    const works = parseJsonContent(worksFile, worksJsonPath);

    if (!Array.isArray(works)) {
      return jsonResponse({
        success: false,
        ...session.body,
        error: {
          code: 'invalid_works_json',
          message: '現在のworks.jsonが配列ではありません。'
        }
      }, 500);
    }

    const targetIndex = works.findIndex((work) => work?.id === workId);
    if (targetIndex === -1) {
      return jsonResponse({
        success: false,
        ...session.body,
        error: {
          code: 'work_not_found',
          message: `作品が見つかりません: ${workId}`
        }
      }, 404);
    }

    const nextWorks = works.filter((work) => work?.id !== workId);
    const update = await updateContentFile(config.value, installationToken, {
      filePath: worksJsonPath,
      content: formatJson(nextWorks),
      sha: worksFile.sha,
      message: `Delete work ${workId}`
    });

    return jsonResponse({
      success: true,
      commitUrl: update.commit?.html_url,
      updatedFile: worksJsonPath,
      deletedWorkId: workId
    });
  } catch (err) {
    console.error('Works JSON delete failed', err);
    return jsonResponse({
      success: false,
      ...session.body,
      error: publicError(err, 'works_delete_failed')
    }, err.status || 500);
  }
}

export async function onRequestGet() {
  return jsonResponse({
    success: false,
    error: {
      code: 'method_not_allowed',
      message: '作品保存はPOSTで実行してください。'
    }
  }, 405);
}

function normalizeWork(input) {
  if (!isObject(input)) {
    return {
      ok: false,
      error: {
        code: 'invalid_work_payload',
        message: '追加する作品データが不正です。'
      }
    };
  }

  if (Object.prototype.hasOwnProperty.call(input, 'sourcePath')) {
    return {
      ok: false,
      error: {
        code: 'source_path_not_allowed',
        message: 'sourcePathはCloudflare保存APIでは受け付けません。'
      }
    };
  }

  const id = trim(input.id);
  return {
    ok: true,
    value: {
      id,
      title: trim(input.title),
      date: trim(input.date),
      location: trim(input.location),
      production: trim(input.production),
      caption: trim(input.caption),
      modelIds: normalizeModelIds(input.modelIds),
      image: trim(input.image || `/images/works/large/${id}.webp`),
      thumbnail: trim(input.thumbnail || `/images/works/thumbs/${id}.webp`)
    }
  };
}

function validateNewWork(work, works, models) {
  const required = ['id', 'title', 'date', 'location', 'image', 'thumbnail'];
  const missing = required.filter((key) => !work[key]);
  if (missing.length) {
    return validationError('missing_required_fields', '必須項目が不足しています。', { missing });
  }

  if (!/^\d{6}[A-Za-z0-9][A-Za-z0-9_]*_\d{4}$/.test(work.id)) {
    return validationError(
      'invalid_work_id',
      '作品IDは YYMMDD + モデル名 + _ + 4桁通し番号 の形式で入力してください。'
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(work.date)) {
    return validationError('invalid_date', '日付はYYYY-MM-DD形式で入力してください。');
  }

  if (!Array.isArray(work.modelIds) || !work.modelIds.length) {
    return validationError('missing_model_ids', 'modelIdsは1件以上必要です。');
  }

  if (works.some((item) => item?.id === work.id)) {
    return {
      ok: false,
      status: 409,
      error: {
        code: 'duplicate_work_id',
        message: `既存IDです: ${work.id}`
      }
    };
  }

  const modelIds = new Set(Array.isArray(models) ? models.map((model) => model?.id).filter(Boolean) : []);
  const unknownModelIds = work.modelIds.filter((modelId) => !modelIds.has(modelId));
  if (unknownModelIds.length) {
    return validationError(
      'unknown_model_ids',
      `models.jsonに存在しないモデルIDです: ${unknownModelIds.join(', ')}`,
      { unknownModelIds }
    );
  }

  const invalidImagePath = [work.image, work.thumbnail].find((value) => !value.startsWith('/images/'));
  if (invalidImagePath) {
    return validationError('invalid_image_path', '画像パスは /images/ 配下を指定してください。');
  }

  return { ok: true };
}

function validationError(code, message, details = {}) {
  return {
    ok: false,
    status: 400,
    error: {
      code,
      message,
      ...details
    }
  };
}

function normalizeModelIds(value) {
  if (Array.isArray(value)) {
    return value.map(trim).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(',').map(trim).filter(Boolean);
  }

  return [];
}

function trim(value) {
  return String(value || '').trim();
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
