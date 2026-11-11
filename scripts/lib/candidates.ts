/**
 * Suggests likely names in a source for a model that has no working
 * mapping. Suggestions are only ever printed for a human to copy into the
 * overrides file; suggestions are never applied (docs/SPEC.md §4.1).
 */

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** 0–1 similarity: share of the wanted tokens found, lightly penalising extra tokens. */
function similarity(wanted: string[], candidate: string[]): number {
  if (wanted.length === 0 || candidate.length === 0) return 0;
  const pool = new Set(candidate);
  const hits = wanted.filter((token) => pool.has(token)).length;
  if (hits === 0) return 0;
  const recall = hits / wanted.length;
  const precision = hits / candidate.length;
  return 0.75 * recall + 0.25 * precision;
}

export interface Candidate {
  /** What to paste into the overrides file. */
  id: string;
  /** Extra text to match against (display name, vendor…). */
  text?: string;
}

/** The closest entries of a source to the given model, best first. */
export function suggest(
  model: { id: string; name: string },
  pool: Candidate[],
  limit: number = 5,
): string[] {
  const byName = tokens(model.name);
  const bySlug = tokens(model.id.split('/').pop() ?? model.id);
  return pool
    .map((candidate) => {
      const candidateTokens = tokens(`${candidate.id} ${candidate.text ?? ''}`);
      const idTokens = tokens(candidate.id);
      const score = Math.max(
        similarity(byName, idTokens),
        similarity(bySlug, idTokens),
        similarity(byName, candidateTokens) * 0.95,
      );
      return { id: candidate.id, score };
    })
    .filter((item) => item.score >= 0.6)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, 'en'))
    .slice(0, limit)
    .map((item) => item.id);
}
