function decodeFlightChunk(chunk) {
  return JSON.parse(`"${chunk}"`);
}

function visit(value, predicate) {
  if (predicate(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = visit(item, predicate);

      if (result) {
        return result;
      }
    }
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const result = visit(item, predicate);

      if (result) {
        return result;
      }
    }
  }

  return null;
}

function extractModelsFromFlightPayload(html) {
  const chunkPattern = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g;

  for (const match of html.matchAll(chunkPattern)) {
    const decodedChunk = decodeFlightChunk(match[1]);
    const separatorIndex = decodedChunk.indexOf(":");

    if (separatorIndex === -1) {
      continue;
    }

    const payloadText = decodedChunk.slice(separatorIndex + 1).trim();

    if (!payloadText.includes('"intelligence_index"') || !payloadText.includes('"models"')) {
      continue;
    }

    const payload = JSON.parse(payloadText);
    const matchedNode = visit(
      payload,
      (node) =>
        Boolean(
          node &&
            typeof node === "object" &&
            Array.isArray(node.models) &&
            node.models.some((model) => typeof model?.intelligence_index === "number"),
        ),
    );

    if (matchedNode) {
      return matchedNode.models;
    }
  }

  throw new Error("Could not find leaderboard models in React Flight payload");
}

export function extractLeaderboardSnapshot(html) {
  const models = extractModelsFromFlightPayload(html);

  const simplifiedModels = models
    .filter((model) => typeof model?.intelligence_index === "number" && model?.short_name && model?.model_creators?.slug)
    .map((model) => ({
      id: model.id,
      slug: model.slug,
      shortName: model.short_name,
      intelligenceIndex: model.intelligence_index,
      estimatedIntelligenceIndex: model.estimated_intelligence_index,
      creator: {
        name: model.model_creators.name,
        slug: model.model_creators.slug,
      },
      modelUrl: model.model_url ? `https://artificialanalysis.ai${model.model_url}` : null,
    }));

  if (simplifiedModels.length === 0) {
    throw new Error("Leaderboard payload did not contain any models with intelligence scores");
  }

  return {
    source: "artificialanalysis.ai",
    leaderboardUrl: LEADERBOARD_URL,
    fetchedAt: new Date().toISOString(),
    modelCount: simplifiedModels.length,
    models: simplifiedModels,
  };
}

const LEADERBOARD_URL = "https://artificialanalysis.ai/leaderboards/models";
