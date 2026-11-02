import type { APIRoute } from "astro";
import worksData from "../data/works.json";
import modelsData from "../data/models.json";

export const GET: APIRoute = () => {
  const modelNameMap = new Map(
    modelsData.map((model) => [model.id, model.name])
  );

  const works = worksData.map((work) => {
    const modelIds = Array.isArray(work.modelIds)
      ? work.modelIds
      : [];

    return {
      id: work.id,
      title: work.title,
      date: work.date,
      modelIds,
      modelNames: modelIds
        .map((id) => modelNameMap.get(id))
        .filter(Boolean),
      image: work.image,
    };
  });

  return new Response(JSON.stringify(works), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
};
