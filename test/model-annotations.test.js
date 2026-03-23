import test from "node:test";
import assert from "node:assert/strict";
import { applyIntelligenceAnnotations, buildProviderNamePatch } from "../src/model-annotations.js";

test("applyIntelligenceAnnotations appends the AAII score to matching model names", () => {
  const config = {
    provider: {
      openai: {
        models: {
          "gpt-5.3-codex": {
            name: "GPT-5.3 Codex (xhigh)",
          },
        },
      },
    },
  };

  applyIntelligenceAnnotations(config, {
    models: [
      {
        slug: "gpt-5-3-codex",
        shortName: "GPT-5.3 Codex (xhigh)",
        intelligenceIndex: 53.97,
        creator: {
          slug: "openai",
        },
      },
    ],
  });

  assert.equal(config.provider.openai.models["gpt-5.3-codex"].name, "GPT-5.3 Codex (xhigh) [AAII 53.97]");
});

test("applyIntelligenceAnnotations annotates configured provider models by name only", () => {
  const config = {
    provider: {
      openrouter: {
        models: {
          "anthropic/claude-sonnet-4.6": {
            id: "anthropic/claude-sonnet-4.6",
            name: "Claude Sonnet 4.6 (Adaptive Reasoning, Max Effort)",
          },
        },
      },
      "azure-openai": {
        models: {
          "gpt-5.3-codex": {
            id: "gpt-5.3-codex",
            name: "GPT-5.3 Codex (xhigh)",
          },
        },
      },
    },
  };

  const leaderboard = {
    models: [
      {
        slug: "claude-sonnet-4-6",
        shortName: "Claude Sonnet 4.6 (Adaptive Reasoning, Max Effort)",
        intelligenceIndex: 52,
        creator: {
          slug: "anthropic",
        },
      },
      {
        slug: "gpt-5-3-codex",
        shortName: "GPT-5.3 Codex (xhigh)",
        intelligenceIndex: 53.97,
        creator: {
          slug: "openai",
        },
      },
    ],
  };

  applyIntelligenceAnnotations(config, leaderboard);

  assert.equal(
    config.provider.openrouter.models["anthropic/claude-sonnet-4.6"].name,
    "Claude Sonnet 4.6 (Adaptive Reasoning, Max Effort) [AAII 52]",
  );
  assert.equal(
    config.provider["azure-openai"].models["gpt-5.3-codex"].name,
    "GPT-5.3 Codex (xhigh) [AAII 53.97]",
  );
});

test("applyIntelligenceAnnotations prefers the reasoning variant when names are otherwise the same", () => {
  const config = {
    provider: {
      openrouter: {
        models: {
          "glm-5-reasoning": {
            id: "some-host/glm-5",
            name: "GLM-5 (Reasoning)",
          },
          "glm-5-non-reasoning": {
            id: "some-host/glm-5-non-reasoning",
            name: "GLM-5 (Non-reasoning)",
          },
        },
      },
    },
  };

  const leaderboard = {
    models: [
      {
        slug: "glm-5-reasoning",
        shortName: "GLM-5 (Reasoning)",
        intelligenceIndex: 50,
        creator: {
          slug: "zai",
        },
      },
      {
        slug: "glm-5-non-reasoning",
        shortName: "GLM-5 (Non-reasoning)",
        intelligenceIndex: 42,
        creator: {
          slug: "zai",
        },
      },
    ],
  };

  applyIntelligenceAnnotations(config, leaderboard);

  assert.equal(
    config.provider.openrouter.models["glm-5-reasoning"].name,
    "GLM-5 (Reasoning) [AAII 50]",
  );
  assert.equal(
    config.provider.openrouter.models["glm-5-non-reasoning"].name,
    "GLM-5 (Non-reasoning) [AAII 42]",
  );
});

test("buildProviderNamePatch generates overrides for every matching provider occurrence", () => {
  const patch = buildProviderNamePatch(
    [
      {
        id: "moonshotai",
        models: {
          "kimi-k2.5": {
            id: "kimi-k2.5",
            name: "Kimi K2.5",
          },
        },
      },
      {
        id: "fireworks-ai",
        models: {
          "accounts/fireworks/models/kimi-k2-5": {
            id: "accounts/fireworks/models/kimi-k2-5",
            name: "Kimi K2.5",
          },
        },
      },
    ],
    {
      models: [
        {
          slug: "kimi-k2-5",
          shortName: "Kimi K2.5",
          intelligenceIndex: 46.81,
          creator: {
            slug: "moonshotai",
          },
        },
      ],
    },
  );

  assert.equal(patch.provider.moonshotai.models["kimi-k2.5"].name, "Kimi K2.5 [AAII 46.81]");
  assert.equal(
    patch.provider["fireworks-ai"].models["accounts/fireworks/models/kimi-k2-5"].name,
    "Kimi K2.5 [AAII 46.81]",
  );
});

test("buildProviderNamePatch only includes changed model names", () => {
  const patch = buildProviderNamePatch(
    [
      {
        id: "example",
        models: {
          exact: {
            id: "exact",
            name: "Kimi K2.5",
          },
          unmatched: {
            id: "unmatched",
            name: "Completely Different Model",
          },
        },
      },
    ],
    {
      models: [
        {
          slug: "kimi-k2-5",
          shortName: "Kimi K2.5",
          intelligenceIndex: 46.81,
          creator: {
            slug: "moonshotai",
          },
        },
      ],
    },
  );

  assert.deepEqual(Object.keys(patch.provider.example.models), ["exact"]);
  assert.equal(patch.provider.example.models.exact.name, "Kimi K2.5 [AAII 46.81]");
});
