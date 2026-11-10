/**
 * Frontmatter schema of `src/content/models/<provider>/<model>.md`
 * (docs/SPEC.md §5.2), shared by the Astro content collection and the
 * Node scripts. Must not import `astro:*` modules.
 */
import { z } from 'astro/zod';

/** Directory of the model files, relative to the repository root. */
export const MODELS_DIR = 'src/content/models';

/** Maximum length of the one-line verdict. */
export const VERDICT_MAX_LENGTH = 40;

/**
 * Canonical model ID from a path relative to MODELS_DIR:
 * `openai/gpt-6.1-sol.md` → `openai/gpt-6.1-sol`. The ID is taken verbatim
 * (dots and upper case are kept) because it has to match models.dev.
 */
export function modelIdFromPath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\.md$/i, '');
}

// YAML turns an empty value (`score:`) into null and an empty string is
// just as empty, so both mean "not filled in".
const blankToUndefined = (value: unknown) =>
  value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value;

const optionalString = z.preprocess(blankToUndefined, z.string().trim().optional());

const stringList = z.preprocess(
  (value) => (value === null || value === undefined ? [] : value),
  z.array(z.string().trim().min(1)),
);

// YAML parsers disagree on bare dates: some return a Date, some a string.
const isoDate = z.preprocess((value) => {
  const filled = blankToUndefined(value);
  if (filled instanceof Date) return filled.toISOString().slice(0, 10);
  return filled;
}, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date like 2026-11-11').optional());

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
      }),
    )
    .default({}),
  /** KC's own judgement. Never filled in by tooling. */
  subjective: z
    .preprocess(
      (value) => value ?? {},
      z.object({
        /** 0–100, where 100 means "the best there is right now". */
        score: z.preprocess(blankToUndefined, z.number().min(0).max(100).optional()),
        verdict: z.preprocess(
          blankToUndefined,
          z
            .string()
            .trim()
            .max(VERDICT_MAX_LENGTH, `verdict must be at most ${VERDICT_MAX_LENGTH} characters`)
            .optional(),
        ),
        pros: stringList,
        cons: stringList,
        best_for: stringList,
      }),
    )
    .default({ pros: [], cons: [], best_for: [] }),
  /** Manual overrides of automatically fetched data. */
  overrides: z
    .preprocess(
      (value) => value ?? {},
      z.object({
        price: z
          .preprocess(
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
  /** Date of the latest review, YYYY-MM-DD. */
  reviewed_at: isoDate,
});

export type ModelFrontmatter = z.infer<typeof modelSchema>;

/** One model file after validation. */
export interface ModelEntry {
  /** Canonical ID, `<provider>/<model>`. */
  id: string;
  data: ModelFrontmatter;
  /** True when the Markdown body (the long review) is not empty. */
  hasReview: boolean;
}
