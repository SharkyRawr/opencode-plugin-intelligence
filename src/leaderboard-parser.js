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

  // Flight records can span script chunks, so reassemble them before parsing.
  const flightPayload = [...html.matchAll(chunkPattern)]
    .map((match) => decodeFlightChunk(match[1]))
    .join("");

  for (const record of flightPayload.split("\n")) {
    const separatorIndex = record.indexOf(":");
    if (separatorIndex === -1) continue;
    const payloadText = record.slice(separatorIndex + 1).trim();
    if (
      !payloadText.includes('"models"') ||
      (!payloadText.includes('"intelligence_index"') &&
        !payloadText.includes('"intelligenceIndex"'))
    )
      continue;

    let payload;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      continue;
    }
    const matchedNode = visit(
      payload,
      (node) =>
        Array.isArray(node?.models) &&
        node.models.some((model) =>
          Number.isFinite(
            model?.intelligenceIndex ?? model?.intelligence_index,
          ),
        ),
    );
    if (matchedNode) return matchedNode.models;
  }

  throw new Error("Could not find leaderboard models in React Flight payload");
}

export function extractLeaderboardSnapshot(html) {
  const models = extractModelsFromFlightPayload(html);

  const simplifiedModels = models
    .filter(
      (model) =>
        Number.isFinite(
          model?.intelligenceIndex ?? model?.intelligence_index,
        ) &&
        typeof (model.shortName ?? model.short_name) === "string" &&
        (model.shortName ?? model.short_name),
    )
    .map((model) => ({
      id: model.id ?? model.slug,
      slug: model.slug,
      shortName: model.shortName ?? model.short_name,
      intelligenceIndex: model.intelligenceIndex ?? model.intelligence_index,
      estimatedIntelligenceIndex:
        model.intelligenceIndexIsEstimated ??
        model.estimated_intelligence_index,
      creator: {
        name: model.modelCreatorName ?? model.model_creators?.name ?? null,
        slug: model.model_creators?.slug ?? null,
      },
      modelUrl: model.model_url
        ? `https://artificialanalysis.ai${model.model_url}`
        : null,
    }));

  if (simplifiedModels.length === 0) {
    throw new Error(
      "Leaderboard payload did not contain any models with intelligence scores",
    );
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
