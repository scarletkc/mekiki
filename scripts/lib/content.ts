/**
 * Reads the model files without Astro, for `pnpm sync`, `pnpm report` and
 * tests. Uses the same schema and the same ID function as the Astro
 * content collection, so both sides always agree.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  MODELS_DIR,
  modelIdFromPath,
  modelSchema,
  type ModelEntry,
} from '../../src/lib/model-schema';

const FRONTMATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/;

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) files.push(...walk(path));
    else if (item.isFile() && item.name.toLowerCase().endsWith('.md')) files.push(path);
  }
  return files;
}

/** Parse one model file. Throws with the file name when the frontmatter is invalid. */
export function parseModelFile(text: string, relativePath: string): ModelEntry {
  const match = FRONTMATTER.exec(text);
  if (!match) {
    throw new Error(`${relativePath}: missing frontmatter (the file must start with ---).`);
  }
  let raw: unknown;
  try {
    raw = parseYaml(match[1] ?? '');
  } catch (error) {
    throw new Error(`${relativePath}: invalid YAML: ${(error as Error).message}`);
  }
  const parsed = modelSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`${relativePath}: invalid frontmatter\n${issues}`);
  }
  return {
    id: modelIdFromPath(relativePath),
    data: parsed.data,
    hasReview: (match[2] ?? '').trim().length > 0,
  };
}

/** All model files under src/content/models, sorted by ID. */
export function readModelEntries(root: string = process.cwd()): ModelEntry[] {
  const base = join(root, MODELS_DIR);
  let files: string[];
  try {
    files = walk(base);
  } catch {
    return [];
  }
  return files
    .map((file) => parseModelFile(readFileSync(file, 'utf8'), relative(base, file)))
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
}
