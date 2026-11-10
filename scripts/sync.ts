/**
 * `pnpm sync`: runs every source adapter and refreshes data/snapshots/.
 *
 *   pnpm sync                 all sources
 *   pnpm sync --only=arena    one source (repeatable, comma-separated)
 *   pnpm sync --dry-run       fetch and report, write nothing
 *
 * A source that fails, returns invalid data or returns suspiciously few
 * models keeps its old snapshot. The command still exits 0 so a broken
 * source can never block a deploy; the reason goes to the console and to
 * the GitHub Actions job summary.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  SOURCE_IDS,
  SOURCE_INFO,
  readSnapshot,
  snapshotPath,
  type SourceId,
} from '../src/lib/snapshots';
import { readModelEntries } from './lib/content';
import { adapters, trackedModels } from './sources';
import { SourceDataError, type Unmatched } from './sources/types';

/** A drop below this share of the previous model count is treated as an outage. */
const MIN_SHARE_OF_PREVIOUS = 0.5;

type Outcome =
  | { status: 'updated' | 'unchanged'; total: number; matched: number }
  | { status: 'skipped' | 'failed'; reason: string };

interface SourceReport {
  source: SourceId;
  outcome: Outcome;
  unmatched: Unmatched[];
  warnings: string[];
}

function parseArgs(argv: string[]) {
  const only = new Set<SourceId>();
  let dryRun = false;
  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--only=')) {
      for (const name of arg.slice('--only='.length).split(',')) {
        if (!(SOURCE_IDS as readonly string[]).includes(name)) {
          throw new Error(`Unknown source "${name}". Known sources: ${SOURCE_IDS.join(', ')}.`);
        }
        only.add(name as SourceId);
      }
    } else {
      throw new Error(`Unknown argument "${arg}".`);
    }
  }
  return {
    sources: only.size > 0 ? SOURCE_IDS.filter((id) => only.has(id)) : [...SOURCE_IDS],
    dryRun,
  };
}

/** Stable JSON: model keys sorted so diffs only show real changes. */
function serialize<T extends { models: Record<string, unknown> }>(snapshot: T): string {
  const models = Object.fromEntries(
    Object.entries(snapshot.models).sort(([a], [b]) => a.localeCompare(b, 'en')),
  );
  return `${JSON.stringify({ ...snapshot, models }, null, 2)}\n`;
}

/**
 * The part of a snapshot that decides whether it changed. `total` is left
 * out on purpose: a source gaining a model nobody tracks (models.dev does
 * so almost daily) is not a change worth a commit.
 */
function comparable(snapshot: {
  edition?: string;
  frontier: unknown;
  models: Record<string, unknown>;
}): string {
  return serialize({
    edition: snapshot.edition,
    frontier: snapshot.frontier,
    models: snapshot.models,
  });
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` (${error.cause.message})` : '';
    return `${error.message}${cause}`;
  }
  return String(error);
}

async function syncSource<S extends SourceId>(
  source: S,
  entries: ReturnType<typeof readModelEntries>,
  dryRun: boolean,
): Promise<SourceReport> {
  const adapter = adapters[source];
  const report: SourceReport = {
    source,
    outcome: { status: 'failed', reason: 'unknown' },
    unmatched: [],
    warnings: [],
  };

  try {
    const fetched = await adapter.fetch({ env: process.env });
    if ('skip' in fetched) {
      report.outcome = { status: 'skipped', reason: fetched.skip };
      return report;
    }

    const { snapshot, unmatched, warnings } = adapter.transform(
      fetched.raw,
      trackedModels(entries),
    );
    report.unmatched = unmatched;
    report.warnings = warnings;

    const total = snapshot.total ?? 0;
    const previous = readSnapshot(source);
    if (total < adapter.minTotal) {
      throw new SourceDataError(
        `Only ${total} models returned (expected at least ${adapter.minTotal}).`,
      );
    }
    if (previous?.total && total < previous.total * MIN_SHARE_OF_PREVIOUS) {
      throw new SourceDataError(
        `Only ${total} models returned, down from ${previous.total} last time.`,
      );
    }

    // `fetched_at` only moves when the data does, so an uneventful day
    // produces no diff and no commit.
    const changed = previous === null || comparable(previous) !== comparable(snapshot);
    const matched = Object.keys(snapshot.models).length;

    if (changed && !dryRun) {
      const path = snapshotPath(source);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        serialize({
          source: snapshot.source,
          fetched_at: new Date().toISOString(),
          total: snapshot.total,
          edition: snapshot.edition,
          frontier: snapshot.frontier,
          models: snapshot.models,
        }),
      );
    }
    report.outcome = { status: changed ? 'updated' : 'unchanged', total, matched };
  } catch (error) {
    report.outcome = { status: 'failed', reason: describeError(error) };
  }
  return report;
}

function statusLine({ source, outcome }: SourceReport, dryRun: boolean): string {
  const name = SOURCE_INFO[source].name;
  switch (outcome.status) {
    case 'updated':
      return `${name}: ${dryRun ? 'would update' : 'updated'} (${outcome.matched} tracked of ${outcome.total} models)`;
    case 'unchanged':
      return `${name}: no change (${outcome.matched} tracked of ${outcome.total} models)`;
    case 'skipped':
      return `${name}: skipped, old snapshot kept. ${outcome.reason}`;
    case 'failed':
      return `${name}: FAILED, old snapshot kept. ${outcome.reason}`;
  }
}

function unmatchedLines(report: SourceReport): string[] {
  const lines: string[] = [];
  for (const { model, field, value, candidates } of report.unmatched) {
    const problem = value === null ? `${field} is empty` : `${field} "${value}" not found`;
    const hint =
      candidates.length > 0
        ? `candidates: ${candidates.map((name) => `"${name}"`).join(', ')}`
        : 'no similar names found';
    lines.push(`${model.id}: ${problem}; ${hint}`);
  }
  return lines;
}

function printConsole(reports: SourceReport[], dryRun: boolean) {
  console.log(dryRun ? '\nSync (dry run)\n' : '\nSync\n');
  for (const report of reports) console.log(`  ${statusLine(report, dryRun)}`);

  for (const report of reports) {
    const lines = unmatchedLines(report);
    if (lines.length === 0) continue;
    console.log(
      `\nUnmatched in ${SOURCE_INFO[report.source].name} (set the field in the model file):`,
    );
    for (const line of lines) console.log(`  ${line}`);
  }

  for (const report of reports) {
    if (report.warnings.length === 0) continue;
    console.log(`\nWarnings from ${SOURCE_INFO[report.source].name}:`);
    for (const warning of report.warnings) console.log(`  ${warning}`);
  }
  console.log('');
}

function writeJobSummary(reports: SourceReport[], dryRun: boolean) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  const lines = ['## Snapshot sync', ''];
  for (const report of reports) lines.push(`- ${statusLine(report, dryRun)}`);
  for (const report of reports) {
    const unmatched = unmatchedLines(report);
    if (unmatched.length > 0) {
      lines.push('', `### Unmatched in ${SOURCE_INFO[report.source].name}`, '');
      lines.push(...unmatched.map((line) => `- ${line}`));
    }
    if (report.warnings.length > 0) {
      lines.push('', `### Warnings from ${SOURCE_INFO[report.source].name}`, '');
      lines.push(...report.warnings.map((line) => `- ${line}`));
    }
  }
  appendFileSync(file, `${lines.join('\n')}\n`);
}

async function main() {
  // Local convenience: read AA_API_KEY from .env when present.
  try {
    process.loadEnvFile('.env');
  } catch {
    // No .env file; rely on the environment.
  }

  const { sources, dryRun } = parseArgs(process.argv.slice(2));
  const entries = readModelEntries();
  console.log(`Tracking ${entries.length} models.`);

  const reports: SourceReport[] = [];
  for (const source of sources) reports.push(await syncSource(source, entries, dryRun));

  printConsole(reports, dryRun);
  writeJobSummary(reports, dryRun);
}

main().catch((error) => {
  // Only programming or content errors land here (e.g. invalid frontmatter).
  console.error(describeError(error));
  process.exitCode = 1;
});
