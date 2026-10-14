import assert from "node:assert/strict";
import test from "node:test";
import { extractLeaderboardSnapshot } from "../src/leaderboard-parser.js";

const fixture = `
<script>
self.__next_f.push([1,"29:[\\"$\\",\\"div\\",null,{\\"models\\":[{\\"accepted_benchmark_scores\\":{},\\"id\\":\\"1\\",\\"slug\\":\\"gpt-5-3-codex\\",\\"intelligence_index\\":53.97,\\"estimated_intelligence_index\\":null,\\"short_name\\":\\"GPT-5.3 Codex (xhigh)\\",\\"model_creators\\":{\\"name\\":\\"OpenAI\\",\\"slug\\":\\"openai\\"},\\"model_url\\":\\"/models/gpt-5-3-codex\\"},{\\"accepted_benchmark_scores\\":{},\\"id\\":\\"2\\",\\"slug\\":\\"claude-sonnet-4-6\\",\\"intelligence_index\\":52,\\"estimated_intelligence_index\\":false,\\"short_name\\":\\"Claude Sonnet 4.6 (Adaptive Reasoning, Max Effort)\\",\\"model_creators\\":{\\"name\\":\\"Anthropic\\",\\"slug\\":\\"anthropic\\"},\\"model_url\\":\\"/models/claude-sonnet-4-6\\"}]}]\\n"]);
</script>
`;

test("extractLeaderboardSnapshot parses model scores from escaped payloads", () => {
  const snapshot = extractLeaderboardSnapshot(fixture);

  assert.equal(snapshot.source, "artificialanalysis.ai");
  assert.equal(snapshot.modelCount, 2);
  assert.deepEqual(snapshot.models[0], {
    id: "1",
    slug: "gpt-5-3-codex",
    shortName: "GPT-5.3 Codex (xhigh)",
    intelligenceIndex: 53.97,
    estimatedIntelligenceIndex: null,
    creator: {
      name: "OpenAI",
      slug: "openai",
    },
    modelUrl: "https://artificialanalysis.ai/models/gpt-5-3-codex",
  });
});

function flightScript(text) {
  return `<script>self.__next_f.push([1,${JSON.stringify(text)}]);</script>`;
}

test("parses current camelCase models in a Flight record split across scripts", () => {
  const models = [
    {
      slug: "example",
      shortName: "Example Model",
      intelligenceIndex: 60,
      intelligenceIndexIsEstimated: false,
      modelCreatorName: "Example Creator",
    },
    { slug: "unscored", shortName: "Unscored Model", intelligenceIndex: null },
  ];
  const record = `35:${JSON.stringify(["$", "div", null, { children: [["$", "$L36", null, { models }]] }])}\n`;
  const split = record.indexOf("intelligenceIndex") + 5;
  const html =
    flightScript('1:"$Sreact.fragment"\n2:I[123]\n') +
    flightScript(record.slice(0, split)) +
    flightScript(record.slice(split));
  const snapshot = extractLeaderboardSnapshot(html);
  assert.equal(snapshot.modelCount, 1);
  assert.deepEqual(snapshot.models[0], {
    id: "example",
    slug: "example",
    shortName: "Example Model",
    intelligenceIndex: 60,
    estimatedIntelligenceIndex: false,
    creator: { name: "Example Creator", slug: null },
    modelUrl: null,
  });
});

test("rejects a leaderboard with no usable scores", () => {
  const html = flightScript(
    '35:{"models":[{"shortName":"Unscored","intelligenceIndex":null}]}\n',
  );
  assert.throws(
    () => extractLeaderboardSnapshot(html),
    /Could not find leaderboard models/,
  );
});
