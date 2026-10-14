const INTELLIGENCE_TAG_PATTERN =
  /(?:\s+(?:\[AAII [0-9]+(?:\.[0-9]+)?\]|\(AIQ: [0-9]+(?:\.[0-9]+)?\)))+$/;

function normalizeText(value) {
  return value
    .toLowerCase()
    .replace(/[-\s:]+free$/, "")
    .replace(/\bpreview\b/g, "")
    .replace(/\badaptive reasoning\b/g, "")
    .replace(/\bmax effort\b/g, "max")
    .replace(/\bhigh effort\b/g, "high")
    .replace(/\blow effort\b/g, "low")
    .replace(/\bexperimental\b/g, "")
    .replace(/\bchat\b/g, "")
    .replace(/[()]/g, " ")
    .replace(/[_/]/g, " ")
    .replace(/:/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function reasoningVariant(value) {
  if (/\bnon reasoning\b|\bnon-reasoning\b/.test(value)) {
    return "non-reasoning";
  }

  if (/\badaptive reasoning\b|\breasoning\b|\bthinking\b/.test(value)) {
    return "reasoning";
  }

  return "unspecified";
}

function scoreTag(score) {
  return `(AIQ: ${Number(score.toFixed(2)).toString()})`;
}

function setModelOverride(providerConfig, modelId, displayName) {
  providerConfig.models ||= {};
  providerConfig.models[modelId] ||= {};
  providerConfig.models[modelId].name = displayName;
}

function baseDisplayName(name) {
  return name.replace(INTELLIGENCE_TAG_PATTERN, "");
}

function nameVariants(value) {
  const normalized = normalizeText(value);
  const variants = new Set([normalized]);
  variants.add(
    normalized
      .replace(/(\d)[.-](?=\d)/g, "$1.")
      .replace(/[-\s]+/g, " ")
      .trim(),
  );

  if (normalized.includes(".")) {
    variants.add(normalized.replaceAll(".", " "));
    variants.add(normalized.replaceAll(".", ""));
  }

  if (normalized.includes("-")) {
    variants.add(normalized.replaceAll("-", " "));
  }

  return [...variants].filter(Boolean);
}

function modelCandidates(modelId, modelName) {
  const candidates = new Set();
  // Prefer explicit display-name variants over a provider's generic model ID.
  for (const value of [modelName, modelId, modelId?.split("/").at(-1)].filter(
    Boolean,
  )) {
    for (const variant of nameVariants(value)) {
      candidates.add(variant);
      candidates.add(variant.replaceAll(" ", "-"));
      candidates.add(variant.replaceAll(" ", ""));
    }
  }

  return [...candidates].filter(Boolean);
}

function buildNameIndex(models) {
  const index = new Map();

  for (const model of models) {
    const variants = new Set(
      [model.shortName, model.slug].filter(Boolean).flatMap(nameVariants),
    );
    for (const variant of variants) {
      const items = index.get(variant) ?? [];
      items.push(model);
      index.set(variant, items);
    }
  }

  return index;
}

function scoreReasoningPreference(targetVariant, candidateVariant) {
  if (targetVariant === candidateVariant) {
    return 3;
  }

  if (targetVariant === "unspecified" || candidateVariant === "unspecified") {
    return 2;
  }

  return 0;
}

function chooseBestNameMatch(candidates, modelName) {
  if (candidates.length <= 1) {
    return candidates[0] ?? null;
  }

  const targetVariant = reasoningVariant(modelName.toLowerCase());
  let best = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    const score = scoreReasoningPreference(
      targetVariant,
      reasoningVariant(candidate.shortName.toLowerCase()),
    );

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function findLeaderboardModel({ modelId, modelName, nameIndex }) {
  for (const candidate of modelCandidates(modelId, modelName)) {
    const matches = nameIndex.get(candidate);

    if (matches?.length) {
      return chooseBestNameMatch(matches, modelName || modelId || "");
    }
  }

  return null;
}

export function createModelNameAnnotator(leaderboard) {
  const nameIndex = buildNameIndex(leaderboard?.models ?? []);
  return (modelId, modelName) => {
    const baseName = baseDisplayName(modelName || modelId);
    const matchedModel = findLeaderboardModel({
      modelId,
      modelName: baseName,
      nameIndex,
    });
    if (!matchedModel || !Number.isFinite(matchedModel.intelligenceIndex))
      return modelName;
    return `${baseName} ${scoreTag(matchedModel.intelligenceIndex)}`;
  };
}

export function applyIntelligenceAnnotations(config, leaderboard) {
  if (!leaderboard?.models?.length) {
    return;
  }

  config.provider ||= {};
  const annotateName = createModelNameAnnotator(leaderboard);

  for (const providerConfig of Object.values(config.provider)) {
    providerConfig.models ||= {};

    for (const [modelId, modelConfig] of Object.entries(
      providerConfig.models,
    )) {
      const currentName = modelConfig.name || modelId;
      const name = annotateName(modelId, currentName);
      if (name !== currentName) setModelOverride(providerConfig, modelId, name);
    }
  }
}

export function buildProviderNamePatch(providers, leaderboard) {
  const config = { provider: {} };
  const candidateConfig = { provider: {} };

  for (const provider of providers) {
    if (!provider?.id || !provider?.models) {
      continue;
    }

    candidateConfig.provider[provider.id] = { models: {} };

    for (const [modelId, model] of Object.entries(provider.models)) {
      candidateConfig.provider[provider.id].models[modelId] = {
        name: model.name,
      };
    }
  }

  applyIntelligenceAnnotations(candidateConfig, leaderboard);

  for (const provider of providers) {
    if (!provider?.id || !provider?.models) {
      continue;
    }

    for (const [modelId, model] of Object.entries(provider.models)) {
      const nextName =
        candidateConfig.provider?.[provider.id]?.models?.[modelId]?.name;

      if (!nextName || nextName === model.name) {
        continue;
      }

      config.provider[provider.id] ||= { models: {} };
      config.provider[provider.id].models[modelId] = { name: nextName };
    }
  }

  return config;
}
