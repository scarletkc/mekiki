import type { ModelEntry } from '../../src/lib/model-schema';
import { readModelList } from '../../src/lib/model-list';

export function readModelEntries(root: string = process.cwd()): ModelEntry[] {
  return readModelList(root);
}
