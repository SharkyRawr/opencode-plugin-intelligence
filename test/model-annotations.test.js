import assert from "node:assert/strict";
import test from "node:test";
import { createModelNameAnnotator } from "../src/model-annotations.js";

test("appends the AIQ score to matching model names", () => {
  const annotate = createModelNameAnnotator({
    models: [
      {
        slug: "gpt-5-3-codex",
        shortName: "GPT-5.3 Codex (xhigh)",
        intelligenceIndex: 53.97,
      },
    ],
  });
  assert.equal(
    annotate("gpt-5.3-codex", "GPT-5.3 Codex (xhigh)"),
    "GPT-5.3 Codex (xhigh) (AIQ: 53.97)",
  );
});

test("matches model names independently of provider and creator identity", () => {
  const annotate = createModelNameAnnotator({
    models: [
      {
        slug: "claude-sonnet-4-6",
        shortName: "Claude Sonnet 4.6 (Adaptive Reasoning, Max Effort)",
        intelligenceIndex: 52,
        creator: { slug: "anthropic" },
      },
      {
        slug: "gpt-5-3-codex",
        shortName: "GPT-5.3 Codex (xhigh)",
        intelligenceIndex: 53.97,
        creator: { slug: "openai" },
      },
    ],
  });
  assert.equal(
    annotate(
      "anthropic/claude-sonnet-4.6",
      "Claude Sonnet 4.6 (Adaptive Reasoning, Max Effort)",
    ),
    "Claude Sonnet 4.6 (Adaptive Reasoning, Max Effort) (AIQ: 52)",
  );
  assert.equal(
    annotate("azure/gpt-5.3-codex", "GPT-5.3 Codex (xhigh)"),
    "GPT-5.3 Codex (xhigh) (AIQ: 53.97)",
  );
});

test("prefers explicit reasoning and non-reasoning variants", () => {
  const annotate = createModelNameAnnotator({
    models: [
      {
        slug: "glm-5-reasoning",
        shortName: "GLM-5 (Reasoning)",
        intelligenceIndex: 50,
      },
      {
        slug: "glm-5-non-reasoning",
        shortName: "GLM-5 (Non-reasoning)",
        intelligenceIndex: 42,
      },
    ],
  });
  assert.equal(
    annotate("some-host/glm-5", "GLM-5 (Reasoning)"),
    "GLM-5 (Reasoning) (AIQ: 50)",
  );
  assert.equal(
    annotate("some-host/glm-5-non-reasoning", "GLM-5 (Non-reasoning)"),
    "GLM-5 (Non-reasoning) (AIQ: 42)",
  );
});

test("annotates the same model across different host IDs", () => {
  const annotate = createModelNameAnnotator({
    models: [
      { slug: "kimi-k2-5", shortName: "Kimi K2.5", intelligenceIndex: 46.81 },
    ],
  });
  for (const id of ["kimi-k2.5", "accounts/fireworks/models/kimi-k2-5"]) {
    assert.equal(annotate(id, "Kimi K2.5"), "Kimi K2.5 (AIQ: 46.81)");
  }
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
