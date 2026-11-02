const SOURCE_URL =
  "https://idoayumu.github.io/pickup-source.json";

const SITE_ORIGIN =
  "https://idoayumu.github.io";

const JEV_URL =
  "https://api.typesafe.ai/v1/systemone";

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": SITE_ORIGIN,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (request.method !== "GET") {
      return json(
        {
          ok: false,
          error: "method_not_allowed",
        },
        405,
        corsHeaders
      );
    }

    try {
      const today = getJstDate();
      const todayKey = `pickup:${today}`;

      const existingRaw =
        await env.PICKUP_KV.get(todayKey);

      if (existingRaw) {
        const existing =
          safeJsonParse(existingRaw);

        const works =
          await fetchWorks();

        const selectedWork =
          works.find(
            (work) =>
              work?.id === existing?.workId
          ) || null;

        return json(
          {
            ok: true,
            cached: true,
            date: today,
            record: existing,
            selectedWork:
              formatWorkForResponse(
                selectedWork
              ),
          },
          200,
          corsHeaders
        );
      }

      const works = await fetchWorks();

      const excludedWorkIds =
        await getRecentSuccessfulWorkIds(
          env.PICKUP_KV,
          today,
          10
        );

      const eligibleWorks =
        works.filter((work) => {
          return (
            work &&
            typeof work.id === "string" &&
            work.id &&
            typeof work.title === "string" &&
            work.title &&
            typeof work.date === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(
              work.date
            ) &&
            !excludedWorkIds.has(work.id)
          );
        });

      if (eligibleWorks.length < 2) {
        return await handleFailure({
          env,
          today,
          candidateCount:
            eligibleWorks.length,
          errorType: "no_candidate",
          works,
          corsHeaders,
        });
      }

      const datedWorks =
        eligibleWorks.map((work) => ({
          ...work,
          dateDistance:
            circularMonthDayDistance(
              today,
              work.date
            ),
        }));

      const nearCandidates =
        pickNearestWorks(
          datedWorks,
          Math.min(15, datedWorks.length)
        );

      const nearIds =
        new Set(
          nearCandidates.map(
            (work) => work.id
          )
        );

      const randomPool =
        datedWorks.filter(
          (work) =>
            !nearIds.has(work.id)
        );

      const randomCandidates =
        shuffle([...randomPool]).slice(
          0,
          Math.min(9, randomPool.length)
        );

      const candidates = [
        ...nearCandidates,
        ...randomCandidates,
      ];

      if (candidates.length < 2) {
        return await handleFailure({
          env,
          today,
          candidateCount:
            candidates.length,
          errorType: "no_candidate",
          works,
          corsHeaders,
        });
      }

      const jevPayload =
        buildJevPayload(
          today,
          candidates
        );

      let jevResponse;

      try {
        jevResponse =
          await callJev(
            env.JEV_API_KEY,
            jevPayload
          );
      } catch (error) {
        console.error(
          "Jev API error",
          error
        );

        return await handleFailure({
          env,
          today,
          candidateCount:
            candidates.length,
          errorType:
            error?.code ||
            "api_error",
          works,
          corsHeaders,
        });
      }

      const selectedWorkId =
        jevResponse?.answers
          ?.pickup?.choice;

      const candidateIds =
        new Set(
          candidates.map(
            (work) => work.id
          )
        );

      if (
        typeof selectedWorkId !==
          "string" ||
        !candidateIds.has(
          selectedWorkId
        )
      ) {
        return await handleFailure({
          env,
          today,
          candidateCount:
            candidates.length,
          errorType:
            "invalid_response",
          works,
          corsHeaders,
        });
      }

      const selectedWork =
        candidates.find(
          (work) =>
            work.id ===
            selectedWorkId
        );

      const record = {
        workId: selectedWorkId,
        selectedAt:
          getJstTimestamp(),
        source: "jev",
        status: "success",
        candidateCount:
          candidates.length,
        errorType: null,
      };

      await env.PICKUP_KV.put(
        todayKey,
        JSON.stringify(record)
      );

      return json(
        {
          ok: true,
          cached: false,
          date: today,
          record,
          selectedWork:
            formatWorkForResponse(
              selectedWork
            ),
        },
        200,
        corsHeaders
      );
    } catch (error) {
      console.error(
        "Pickup worker error",
        error
      );

      return json(
        {
          ok: false,
          error:
            error?.message ||
            "unknown_error",
        },
        500,
        corsHeaders
      );
    }
  },
};

async function fetchWorks() {
  const response = await fetch(
    SOURCE_URL,
    {
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    const error = new Error(
      `pickup-source.json fetch failed: ${response.status}`
    );
    error.code = "data_error";
    throw error;
  }

  const works =
    await response.json();

  if (!Array.isArray(works)) {
    const error = new Error(
      "pickup-source.json is not an array"
    );
    error.code = "data_error";
    throw error;
  }

  return works;
}

function buildJevPayload(
  today,
  candidates
) {
  const criteria = {};

  for (const work of candidates) {
    criteria[work.id] = {
      title: work.title,
      shootingDate: work.date,
    };
  }

  return {
    model: "jev-latest",

    state: {
      today,
      candidates:
        candidates.map(
          (work) => ({
            workId: work.id,
            title: work.title,
            shootingDate:
              work.date,
          })
        ),
    },

    questions: {
      pickup: {
        type: "choice",

        instructions:
          "今日の日付と各作品のタイトル・撮影日を参考に、「本日のピックアップフォト」として最もふさわしい作品を1つ選んでください。今日との日付の近さだけを優先せず、タイトルから受ける印象、季節感、今日という日に選ぶ面白さや意外性も含めて総合的に判断してください。撮影年の新旧は評価材料にしないでください。",

        criteria,
      },
    },
  };
}

async function callJev(
  apiKey,
  payload
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      15000
    );

  try {
    const response = await fetch(
      JEV_URL,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${apiKey}`,
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify(payload),
        signal:
          controller.signal,
      }
    );

    const text =
      await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      const error =
        new Error(
          "Jev returned invalid JSON"
        );
      error.code =
        "invalid_response";
      throw error;
    }

    if (!response.ok) {
      const error =
        new Error(
          `Jev API failed: ${response.status}`
        );
      error.code =
        "api_error";
      error.status =
        response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    if (
      error?.name ===
      "AbortError"
    ) {
      const timeoutError =
        new Error(
          "Jev API timeout"
        );

      timeoutError.code =
        "timeout";

      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function handleFailure({
  env,
  today,
  candidateCount,
  errorType,
  works,
  corsHeaders,
}) {
  const previous =
    await findPreviousSuccess(
      env.PICKUP_KV,
      today,
      365
    );

  if (!previous) {
    return json(
      {
        ok: false,
        date: today,
        status: "jev_error",
        candidateCount,
        errorType,
        selectedWork: null,
        message:
          "本日のピックアップフォトを選出できませんでした。",
      },
      503,
      corsHeaders
    );
  }

  const selectedWork =
    works.find(
      (work) =>
        work?.id ===
        previous.record.workId
    ) || null;

  const record = {
    workId:
      previous.record.workId,
    selectedAt:
      getJstTimestamp(),
    source:
      "fallback_previous",
    status: "jev_error",
    candidateCount,
    errorType,
  };

  await env.PICKUP_KV.put(
    `pickup:${today}`,
    JSON.stringify(record)
  );

  return json(
    {
      ok: true,
      cached: false,
      date: today,
      record,
      selectedWork:
        formatWorkForResponse(
          selectedWork
        ),
      message:
        "本日のAI選出に失敗したため、前回の作品を表示しています。",
    },
    200,
    corsHeaders
  );
}

async function findPreviousSuccess(
  kv,
  today,
  maxDays
) {
  for (
    let i = 1;
    i <= maxDays;
    i += 1
  ) {
    const date =
      addDays(today, -i);

    const raw =
      await kv.get(
        `pickup:${date}`
      );

    if (!raw) continue;

    const record =
      safeJsonParse(raw);

    if (
      record?.status ===
        "success" &&
      typeof record.workId ===
        "string"
    ) {
      return {
        date,
        record,
      };
    }
  }

  return null;
}

async function getRecentSuccessfulWorkIds(
  kv,
  today,
  days
) {
  const result =
    new Set();

  for (
    let i = 1;
    i <= days;
    i += 1
  ) {
    const date =
      addDays(today, -i);

    const raw =
      await kv.get(
        `pickup:${date}`
      );

    if (!raw) continue;

    const record =
      safeJsonParse(raw);

    if (
      record?.status ===
        "success" &&
      typeof record.workId ===
        "string"
    ) {
      result.add(
        record.workId
      );
    }
  }

  return result;
}

function getJstDate() {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(
      new Date()
    );

  const values =
    Object.fromEntries(
      parts.map(
        ({ type, value }) => [
          type,
          value,
        ]
      )
    );

  return `${values.year}-${values.month}-${values.day}`;
}

function getJstTimestamp() {
  const now =
    new Date();

  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }
    ).formatToParts(now);

  const values =
    Object.fromEntries(
      parts.map(
        ({ type, value }) => [
          type,
          value,
        ]
      )
    );

  return (
    `${values.year}-` +
    `${values.month}-` +
    `${values.day}T` +
    `${values.hour}:` +
    `${values.minute}:` +
    `${values.second}+09:00`
  );
}

function addDays(
  dateString,
  offset
) {
  const [
    year,
    month,
    day,
  ] =
    dateString
      .split("-")
      .map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  date.setUTCDate(
    date.getUTCDate() +
      offset
  );

  const y =
    date.getUTCFullYear();

  const m =
    String(
      date.getUTCMonth() + 1
    ).padStart(2, "0");

  const d =
    String(
      date.getUTCDate()
    ).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function circularMonthDayDistance(
  today,
  shootingDate
) {
  const [
    ,
    todayMonth,
    todayDay,
  ] =
    today
      .split("-")
      .map(Number);

  const [
    ,
    workMonth,
    workDay,
  ] =
    shootingDate
      .split("-")
      .map(Number);

  const referenceYear =
    2000;

  const todayDate =
    new Date(
      Date.UTC(
        referenceYear,
        todayMonth - 1,
        todayDay
      )
    );

  const workDate =
    new Date(
      Date.UTC(
        referenceYear,
        workMonth - 1,
        workDay
      )
    );

  const msPerDay =
    24 * 60 * 60 * 1000;

  const directDistance =
    Math.abs(
      Math.round(
        (
          workDate -
          todayDate
        ) /
          msPerDay
      )
    );

  return Math.min(
    directDistance,
    366 - directDistance
  );
}

function pickNearestWorks(
  works,
  limit
) {
  const groups =
    new Map();

  for (const work of works) {
    const distance =
      work.dateDistance;

    if (
      !groups.has(distance)
    ) {
      groups.set(
        distance,
        []
      );
    }

    groups
      .get(distance)
      .push(work);
  }

  const distances =
    [...groups.keys()]
      .sort(
        (a, b) => a - b
      );

  const selected = [];

  for (
    const distance
    of distances
  ) {
    const group =
      shuffle([
        ...groups.get(
          distance
        ),
      ]);

    for (
      const work
      of group
    ) {
      if (
        selected.length >=
        limit
      ) {
        return selected;
      }

      selected.push(work);
    }
  }

  return selected;
}

function shuffle(items) {
  for (
    let i =
      items.length - 1;
    i > 0;
    i -= 1
  ) {
    const j =
      Math.floor(
        Math.random() *
          (i + 1)
      );

    [
      items[i],
      items[j],
    ] = [
      items[j],
      items[i],
    ];
  }

  return items;
}

function safeJsonParse(
  value
) {
  try {
    return JSON.parse(
      value
    );
  } catch {
    return null;
  }
}

function formatWorkForResponse(
  work
) {
  if (!work) return null;

  return {
    id: work.id,
    title: work.title,
    date: work.date,
    modelIds:
      Array.isArray(
        work.modelIds
      )
        ? work.modelIds
        : [],
    modelNames:
      Array.isArray(
        work.modelNames
      )
        ? work.modelNames
        : [],
    image:
      typeof work.image ===
      "string"
        ? `${SITE_ORIGIN}${work.image}`
        : "",
  };
}

function json(
  body,
  status,
  headers
) {
  return new Response(
    JSON.stringify(
      body,
      null,
      2
    ),
    {
      status,
      headers,
    }
  );
}
