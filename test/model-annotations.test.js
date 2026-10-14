import assert from "node:assert/strict";
import test from "node:test";
import {
  applyIntelligenceAnnotations,
  buildProviderNamePatch,
  createModelNameAnnotator,
} from "../src/model-annotations.js";

test("applyIntelligenceAnnotations appends the AIQ score to matching model names", () => {
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

  assert.equal(
    config.provider.openai.models["gpt-5.3-codex"].name,
    "GPT-5.3 Codex (xhigh) (AIQ: 53.97)",
  );
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
    "Claude Sonnet 4.6 (Adaptive Reasoning, Max Effort) (AIQ: 52)",
  );
  assert.equal(
    config.provider["azure-openai"].models["gpt-5.3-codex"].name,
    "GPT-5.3 Codex (xhigh) (AIQ: 53.97)",
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
    "GLM-5 (Reasoning) (AIQ: 50)",
  );
  assert.equal(
    config.provider.openrouter.models["glm-5-non-reasoning"].name,
    "GLM-5 (Non-reasoning) (AIQ: 42)",
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

  assert.equal(
    patch.provider.moonshotai.models["kimi-k2.5"].name,
    "Kimi K2.5 (AIQ: 46.81)",
  );
  assert.equal(
    patch.provider["fireworks-ai"].models["accounts/fireworks/models/kimi-k2-5"]
      .name,
    "Kimi K2.5 (AIQ: 46.81)",
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
  assert.equal(
    patch.provider.example.models.exact.name,
    "Kimi K2.5 (AIQ: 46.81)",
  );
});

test("annotations replace old scores, remain stable, and reject nonfinite scores", () => {
  const annotate = createModelNameAnnotator({
    models: [
      { shortName: "Example Model", intelligenceIndex: 60.123 },
      { shortName: "Invalid Model", intelligenceIndex: NaN },
    ],
  });
  assert.equal(
    annotate("custom-id", "Example Model [AAII 50]"),
    "Example Model (AIQ: 60.12)",
  );
  assert.equal(
    annotate("custom-id", "Example Model (AIQ: 50)"),
    "Example Model (AIQ: 60.12)",
  );
  assert.equal(
    annotate("custom-id", "Example Model (AIQ: 60.12)"),
    "Example Model (AIQ: 60.12)",
  );
  assert.equal(annotate("other", "Invalid Model"), "Invalid Model");
});

test("matches catalog IDs to leaderboard slugs without losing benchmark variants", () => {
  const annotate = createModelNameAnnotator({
    models: [
      {
        slug: "glm-5-3-low",
        shortName: "GLM-5.3 (low)",
        intelligenceIndex: 34.3,
      },
      { slug: "glm-5-3", shortName: "GLM-5.3 (max)", intelligenceIndex: 44.78 },
      {
        slug: "glm-5-2-non-reasoning",
        shortName: "GLM-5.2 (non-reasoning)",
        intelligenceIndex: 22.43,
      },
      { slug: "glm-5-2", shortName: "GLM-5.2 (max)", intelligenceIndex: 33.71 },
      {
        slug: "kimi-k3-low",
        shortName: "Kimi K3 (low)",
        intelligenceIndex: 30.07,
      },
      { slug: "kimi-k3", shortName: "Kimi K3 (max)", intelligenceIndex: 43.59 },
      {
        slug: "deepseek-v4-flash-0420",
        shortName: "DeepSeek V4 Flash (max)",
        intelligenceIndex: 24.17,
      },
      {
        slug: "deepseek-v4-flash",
        shortName: "DeepSeek V4 Flash 0731 (max)",
        intelligenceIndex: 34.33,
      },
      {
        slug: "deepseek-v4-1-flash",
        shortName: "DeepSeek V4.1 Flash (max)",
        intelligenceIndex: 39.46,
      },
      { slug: "step-5", shortName: "Step 5 Preview", intelligenceIndex: 43.73 },
      {
        slug: "longcat-2-0",
        shortName: "LongCat 2.0",
        intelligenceIndex: 19.11,
      },
    ],
  });
  for (const [name, score] of [
    ["glm-5.3", 44.78],
    ["glm-5.2", 33.71],
    ["kimi-k3", 43.59],
    ["deepseek-v4-flash", 34.33],
    ["deepseek-v4.1-flash", 39.46],
    ["step-5-preview-free", 43.73],
  ]) {
    assert.equal(annotate(name, name), `${name} (AIQ: ${score})`);
  }
  assert.equal(
    annotate("some-host/glm-5.3", "Custom Alias"),
    "Custom Alias (AIQ: 44.78)",
  );
  assert.equal(
    annotate("glm-5.3", "GLM-5.3 (low)"),
    "GLM-5.3 (low) (AIQ: 34.3)",
  );
  assert.equal(
    annotate("glm-5.2", "GLM-5.2 (non-reasoning)"),
    "GLM-5.2 (non-reasoning) (AIQ: 22.43)",
  );
  assert.equal(
    annotate("kimi-k3", "Kimi K3 (low)"),
    "Kimi K3 (low) (AIQ: 30.07)",
  );
  for (const name of [
    "longcat-2.5-preview-free",
    "glm-5.30",
    "deepseek-v4.2-flash",
    "kimi-k3-vision",
  ]) {
    assert.equal(annotate(name, name), name);
  }
});
