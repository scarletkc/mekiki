/**
 * `pnpm history`: records today's ratings in data/history.jsonl from the
 * model files and snapshots as they are. It never goes online; `pnpm sync`
 * does the same after refreshing the snapshots.
 *
 *   pnpm history              record today (UTC)
 *   pnpm history --dry-run    report, write nothing
 */
import { recordHistory } from './lib/history';

const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== '--dry-run');
if (unknown.length > 0) {
  console.error(`Unknown argument "${unknown[0]}".`);
  process.exit(1);
}

try {
  const result = recordHistory({ dryRun: args.includes('--dry-run') });
  console.log(`History: ${result.message}`);
  if (result.outcome === 'invalid' || result.outcome === 'skipped') process.exitCode = 1;
} catch (error) {
  // Only content errors land here (e.g. invalid frontmatter).
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
