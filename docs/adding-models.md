# Adding a model

Adding a model means adding one Markdown file. Nothing else needs to change.

1. Find the model on [models.dev](https://models.dev) and note its provider and model ID,
   for example `openai/gpt-6.1-sol`.
2. Create `src/content/models/<provider>/<model>.md`. The path is the model's ID and is
   used as-is, so keep dots and capital letters exactly as models.dev writes them.

   ```markdown
   ---
   name: GPT-6.1 Sol
   vendor: OpenAI
   status: active          # active | legacy (legacy models are collapsed on the home page)
   sources:
     modelsdev: openai/gpt-6.1-sol   # optional; defaults to the file's ID
     aa: gpt-6-1-sol                       # slug on Artificial Analysis
     arena_text: "GPT-6.1 Sol (Max)"       # exact name on the Arena text leaderboard
     arena_webdev: "GPT-6.1 Sol (Max)"     # exact name on the Arena WebDev leaderboard
     terminal_bench: "Codex / GPT-6.1 Sol / max"   # Terminal-Bench row: agent / model / effort
     livebench: gpt-6.1-sol                # model ID on LiveBench
   ---
   ```

   The file is frontmatter only; anything below it is ignored.

3. Run `pnpm sync`. It fetches the model's price and scores, and lists every mapping that
   did not match together with the closest names in that source:

   ```text
   Unmatched in Arena (set the field in the model file):
     openai/gpt-6.1-terra: sources.arena_text is empty; candidates: "GPT-5.6 Terra (xHigh)", "GPT-6.1 Sol (Max)"
   ```

   Copy the right name into the file and run `pnpm sync` again. Until a model has been
   synced, the site shows "no data" for it. In production, the daily workflow (or a manual
   run of it) does the same.

## Choosing the mappings

- **Mappings are always explicit.** Names differ between leaderboards, and the same model
  is often listed once per reasoning level. Nothing is matched by guessing: choose the
  entry for the level you actually use. The two Arena boards list different levels, so
  each has its own field.
- On Artificial Analysis, the base slug without a suffix (`gpt-6-1-sol`, not
  `gpt-6-1-sol-high`) is usually the model's top reasoning level. Pick a suffixed slug to
  rate a different level.
- A Terminal-Bench row is an agent tool, a model and a reasoning effort, and most vendors
  are listed only inside their own tool. The mapping names all three, exactly as
  `pnpm sync` prints them.
- LiveBench lists a model once, at its highest effort unless the ID says otherwise.
- Leave out a source the model isn't on. Leaderboards are grouped by what they measure
  ([design §5.1](SPEC.md#51-intelligence)); a model missing from one is rated on the rest
  of that group, and a model on none of them is shown as "not rated", never as 0.

## Good to know

- **Intelligence needs no upkeep.** There is no hand-entered score, and every score is
  normalised to the current leader on each sync, so nothing needs revisiting when a new
  model takes the lead.
- **Adding or removing a model can nudge the others' value.** Value measures token use
  against the median of the listed models
  ([design §5.3](SPEC.md#53-value)).
- Set `status: legacy` for a superseded model you still want listed. It stays rated but
  is collapsed on the home page.
- To override the models.dev price, add:

  ```yaml
  overrides:
    price: { input: 5, output: 25 }   # USD per 1M tokens; cache_read is optional
  ```

  Without `cache_read` the models.dev cache price is kept, and it counts toward the
  blended price.

- Invalid frontmatter fails `pnpm test` and `pnpm build` with the file name and the field.
