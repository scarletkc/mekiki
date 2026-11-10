import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { MODELS_DIR, modelIdFromPath, modelSchema } from './lib/model-schema';

// One Markdown file per model: src/content/models/<provider>/<model>.md.
// The path is the canonical ID, kept verbatim (models.dev IDs contain dots
// and upper case, which the default slug-based ID would mangle).
const models = defineCollection({
  loader: glob({
    base: `./${MODELS_DIR}`,
    pattern: '**/*.md',
    generateId: ({ entry }) => modelIdFromPath(entry),
  }),
  schema: modelSchema,
});

export const collections = { models };
