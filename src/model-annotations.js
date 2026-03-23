const INTELLIGENCE_TAG_PATTERN = /\s+\[AAII [0-9]+(?:\.[0-9]+)?\]$/;

function normalizeText(value) {
  return value
    .toLowerCase()
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
  return `[AAII ${Number(score.toFixed(2)).toString()}]`;
}

function candidateModelIds(model) {
  const slug = model.slug ?? "";
  const shortName = model.shortName ?? "";
  const candidates = new Set([slug]);

  const slugWithDots = slug.replace(/(\d)-(\d)/g, "$1.$2");
  candidates.add(slugWithDots);

  const compactName = shortName
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9.+-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (compactName) {
    candidates.add(compactName);
  }

  return [...candidates].filter(Boolean);
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

  if (modelId) {
    candidates.add(modelId);
    candidates.add(modelId.toLowerCase());
    candidates.add(modelId.toLowerCase().replaceAll("/", "-"));
    candidates.add(modelId.toLowerCase().replaceAll("/", ""));
  }

  if (modelName) {
    for (const variant of nameVariants(modelName)) {
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
    for (const variant of nameVariants(model.shortName)) {
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
    const score = scoreReasoningPreference(targetVariant, reasoningVariant(candidate.shortName.toLowerCase()));

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

function annotateModelOverride(providerConfig, modelId, displayName) {
  setModelOverride(providerConfig, modelId, displayName);
}

export function applyIntelligenceAnnotations(config, leaderboard) {
  if (!leaderboard?.models?.length) {
    return;
  }

  config.provider ||= {};
  const nameIndex = buildNameIndex(leaderboard.models);

  for (const [providerId, providerConfig] of Object.entries(config.provider)) {
    providerConfig.models ||= {};

    for (const [modelId, modelConfig] of Object.entries(providerConfig.models)) {
      const matchedModel = findLeaderboardModel({
        modelId,
        modelName: modelConfig.name || modelId,
        nameIndex,
      });

      if (!matchedModel) {
        continue;
      }

      const annotatedName = `${baseDisplayName(modelConfig.name || matchedModel.shortName)} ${scoreTag(matchedModel.intelligenceIndex)}`;
      annotateModelOverride(providerConfig, modelId, annotatedName);
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
      const nextName = candidateConfig.provider?.[provider.id]?.models?.[modelId]?.name;

      if (!nextName || nextName === model.name) {
        continue;
      }

      config.provider[provider.id] ||= { models: {} };
      config.provider[provider.id].models[modelId] = { name: nextName };
    }
  }

  return config;
}
