/**
 * Frontmatter schema of `src/content/models/<provider>/<model>.md`
 * (docs/SPEC.md §4.1), shared by the Astro content collection and the
 * Node scripts. Must not import `astro:*` modules.
 */
import { z } from 'astro/zod';

/** Directory of the model files, relative to the repository root. */
export const MODELS_DIR = 'src/content/models';

/**
 * Canonical model ID from a path relative to MODELS_DIR:
 * `openai/gpt-6.1-sol.md` → `openai/gpt-6.1-sol`. The ID is taken verbatim
 * (dots and upper case are kept) because it has to match models.dev.
 */
export function modelIdFromPath(relativePath: string): string {
  return relativePath
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/\.md$/i, '');
}

// YAML turns an empty value (`score:`) into null and an empty string is
// just as empty, so both mean "not filled in".
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
  /** This model's ID in each data source. Always explicit, never fuzzy-matched. */
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

/** One model file after validation. */
export interface ModelEntry {
  /** Canonical ID, `<provider>/<model>`. */
  id: string;
  data: ModelFrontmatter;
}
