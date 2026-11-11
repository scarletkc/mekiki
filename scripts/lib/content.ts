/**
 * The model list for `pnpm sync`, `pnpm report` and `pnpm history`: the
 * generated list with the overrides applied (src/lib/model-list.ts), the
 * same list the site build reads.
 */
import type { ModelEntry } from '../../src/lib/model-schema';
import { readModelList } from '../../src/lib/model-list';

/** Every model the site lists, sorted by ID. */
export function readModelEntries(root: string = process.cwd()): ModelEntry[] {
  return readModelList(root);
}
