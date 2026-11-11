import { z } from 'astro/zod';

const blankToUndefined = (value: unknown) =>
  value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value;

const optionalString = z.preprocess(blankToUndefined, z.string().trim().optional());

const price = z.number().min(0);

export const modelSchema = z.object({
  name: z.string().trim().min(1),
  vendor: z.string().trim().min(1),
  status: z.enum(['active', 'legacy']).default('active'),
  sources: z
    .preprocess(
      (value) => value ?? {},
      z.object({
        modelsdev: optionalString,
        aa: optionalString,
        arena_text: optionalString,
        arena_webdev: optionalString,
        arena_agent: optionalString,
        livebench: optionalString,
      }),
    )
    .default({}),
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

export interface ModelEntry {
  id: string;
  data: ModelFrontmatter;
}
