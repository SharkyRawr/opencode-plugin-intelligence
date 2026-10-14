# @lunacode/opencode-plugin-intelligence

OpenCode v2 plugin that annotates model display names with the Artificial Analysis Intelligence Index.

## What it does

Matched models appear as `Model Name (AIQ: 60)` in the `/models` picker. Scores retain up to two decimal places, for example `(AIQ: 53.97)`. AIQ is the Artificial Analysis Intelligence Index score, not a leaderboard rank or a human IQ score.

The plugin uses OpenCode's native `model.transform` API. It discovers models across available providers, matches their names against the leaderboard, and changes only matched display names. Transforms also apply when OpenCode rebuilds its model catalog. Provider settings, model IDs, and request settings stay intact.

It fetches the leaderboard once and writes a local cache file. It reuses that cache for 24 hours, then refetches on the next plugin load. Concurrent refreshes in the same process share one request. It does not write generated OpenCode config or restart the server.

## Install

This plugin is **OpenCode v2 only** and requires **v2.0.28 or newer v2**. It is **not compatible with OpenCode v1**.

Add the package to `opencode.json` or `opencode.jsonc`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@lunacode/opencode-plugin-intelligence"]
}
```

For a local checkout, use the absolute path to the plugin directory in `plugins`.

If migrating from the old plugin, replace the v1 `plugin` configuration key with v2's `plugins`. Existing `[AAII …]` suffixes on matched catalog names are replaced at runtime. Old generated `~/.config/opencode/config.json` overrides are not needed by this version; remove those annotations manually if you retained them when migrating your config.

## Cache behavior

Default cache path (shared with the previous version):

```text
~/.config/opencode/cache/opencode-plugin-intelligence/leaderboard.json
```

Environment variables (set on the OpenCode server):

- `OPENCODE_INTELLIGENCE_FORCE_REFRESH=1` forces a re-fetch instead of reading the cache when the plugin loads.
- `OPENCODE_INTELLIGENCE_CACHE_PATH=/path/to/leaderboard.json` overrides the cache location.

Manual refresh:

```bash
npm run refresh-cache
```

Reload the plugin or restart OpenCode after manually refreshing to load the new scores. There is no background polling timer. An expired cache refreshes on the next load; if that refresh fails, the plugin warns and uses the stale cache. Separate OpenCode server processes may each issue a refresh; explicit refreshes bypass the 24-hour expiry. If no leaderboard can be loaded, the plugin warns and leaves model names unchanged.

## Matching and limitations

- Matching uses normalized model names, IDs, and leaderboard slugs, independently of provider identity. Version separators and trailing `preview-free` availability labels are normalized. The same model can be annotated on several hosts without provider-specific tables.
- Explicit display-name variants take precedence over generic model IDs. A bare ID matching a leaderboard slug selects that entry (often the max-effort benchmark). A score does not guarantee the selected reasoning settings equal the benchmark settings.
- Only matched models receive a score. Unknown models keep their names.
- OpenCode v2 applies explicit `providers.<id>.models.<id>.name` config overrides after plugin transforms. These names take precedence over AIQ annotations. Remove an explicit name override to let the plugin annotate the catalog name.
- The Artificial Analysis HTML/React Flight payload is not a public API and may change. Cached scores are a snapshot and may be stale while offline or during a long-running server session.

## Verification

```bash
node --test
```

When changing leaderboard fetching or parsing, also run `npm run refresh-cache`.

## License

Licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/): attribution, noncommercial use, and share-alike are required. See [LICENSE](LICENSE) for the full terms.
