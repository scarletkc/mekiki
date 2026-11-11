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
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
