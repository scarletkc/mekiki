/**
 * Schema of one model in the list the site shows (docs/SPEC.md §4.1), after
 * the generated list and the overrides are merged (src/lib/model-list.ts).
 * Shared by the build and the Node scripts. Must not import `astro:*`
 * modules.
 *
 * A model's ID is its models.dev ID, `<provider>/<model>`, kept verbatim
 * (dots and upper case included).
 */
import { z } from 'astro/zod';

// An empty value and an empty string both mean "not filled in".
const blankToUndefined = (value: unknown) =>
  value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value;

const optionalString = z.preprocess(blankToUndefined, z.string().trim().optional());

const price = z.number().min(0);

export const modelSchema = z.object({
  /** Display name. */
  name: z.string().trim().min(1),
  vendor: z.string().trim().min(1),
  /** `legacy` models are collapsed on the home page by default. */
  status: z.enum(['active', 'legacy']).default('active'),
  /** This model's ID in each data source, matched exactly, never by similarity. */
  sources: z
    .preprocess(
      (value) => value ?? {},
      z.object({
        /** `<provider>/<model>` on models.dev. Defaults to the canonical ID. */
        modelsdev: optionalString,
        /** Model slug on Artificial Analysis. */
        aa: optionalString,
        /** Exact model name on the Arena text leaderboard. */
        arena_text: optionalString,
        /** Exact model name on the Arena WebDev leaderboard. */
        arena_webdev: optionalString,
        /** Exact model name on the Arena Agent leaderboard. */
        arena_agent: optionalString,
        /** Model ID on LiveBench. */
        livebench: optionalString,
      }),
    )
    .default({}),
  /** Manual overrides of automatically fetched data. */
  overrides: z
    .preprocess(
      (value) => value ?? {},
      z.object({
        price: z.preprocess(
          blankToUndefined,
          z
            .object({
              input: price,
              output: price,
              cache_read: z.preprocess(blankToUndefined, price.optional()),
            })
            .optional(),
        ),
      }),
    )
    .default({}),
});

export type ModelFrontmatter = z.infer<typeof modelSchema>;

/** One model of the list, after validation. */
export interface ModelEntry {
  /** Canonical ID, `<provider>/<model>`. */
  id: string;
  data: ModelFrontmatter;
}
