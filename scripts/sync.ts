import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  SOURCE_IDS,
  SOURCE_INFO,
  readSnapshot,
  snapshotPath,
  type SourceId,
} from '../src/lib/snapshots';
import {
  MODEL_LIST_FILE,
  mergeModelList,
  readGeneratedList,
  readOverrides,
  serializeModelList,
  waitingOverrides,
  type GeneratedModel,
  type ModelOverrides,
} from '../src/lib/model-list';
import type { ModelEntry } from '../src/lib/model-schema';
import {
  PROVIDER_ALIASES,
  aaEntries,
  arenaEntries,
  discoverModels,
  discoveryReport,
  generatedList,
  livebenchIds,
  modelsdevEntries,
} from './lib/discover';
import { recordHistory } from './lib/history';
import { adapters, trackedModels } from './sources';
import { SourceDataError, type Unmatched } from './sources/types';

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

function serialize<T extends { models: Record<string, unknown> }>(snapshot: T): string {
  const models = Object.fromEntries(
    Object.entries(snapshot.models).sort(([a], [b]) => a.localeCompare(b, 'en')),
  );
  return `${JSON.stringify({ ...snapshot, models }, null, 2)}\n`;
}

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

async function fetchSource(source: SourceId, report: SourceReport): Promise<unknown> {
  try {
    const fetched = await adapters[source].fetch({ env: process.env });
    if ('skip' in fetched) {
      report.outcome = { status: 'skipped', reason: fetched.skip };
      return null;
    }
    return fetched.raw;
  } catch (error) {
    report.outcome = { status: 'failed', reason: describeError(error) };
    return null;
  }
}

function writeSource<S extends SourceId>(
  source: S,
  raw: unknown,
  entries: ModelEntry[],
  dryRun: boolean,
  report: SourceReport,
): void {
  const adapter = adapters[source];
  try {
    const { snapshot, unmatched, warnings } = adapter.transform(raw, trackedModels(entries));
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
    if (value === null) continue;
    const problem = `${field} "${value}" not found`;
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
      `\nUnmatched in ${SOURCE_INFO[report.source].name} (fix it in data/model-overrides.yaml):`,
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

function updateModelList(
  raws: Partial<Record<SourceId, unknown>>,
  overrides: ModelOverrides,
  dryRun: boolean,
): { list: GeneratedModel[]; lines: string[] } {
  const previous = readGeneratedList();
  const keep = (reason: string) => ({
    list: previous,
    lines: [`Model list: kept as it was (${previous.length} models). ${reason}`],
  });
  const missing = SOURCE_IDS.filter((source) => raws[source] === undefined);
  if (missing.length > 0) {
    const names = missing.map((source) => SOURCE_INFO[source].name).join(', ');
    return keep(`Discovery needs every source; not fetched: ${names}.`);
  }
  try {
    const result = discoverModels(
      {
        aa: aaEntries(raws.aa),
        arena: arenaEntries(raws.arena),
        livebench: livebenchIds(raws.livebench),
        modelsdev: modelsdevEntries(raws.modelsdev),
      },
      { ...PROVIDER_ALIASES, ...overrides.aliases },
    );
    const list = generatedList(result);
    if (list.length === 0 || list.length < previous.length * MIN_SHARE_OF_PREVIOUS) {
      return keep(`Discovery found only ${list.length} models.`);
    }
    mergeModelList(list, overrides);
    const changed = serializeModelList(list) !== serializeModelList(previous);
    if (changed && !dryRun) writeFileSync(MODEL_LIST_FILE, serializeModelList(list));
    const verb = changed ? (dryRun ? 'would be updated' : 'updated') : 'no change';
    const waiting = waitingOverrides(list, overrides);
    return {
      list,
      lines: [
        `Model list: ${verb} (${list.length} models).`,
        ...discoveryReport(result, mergeModelList(previous)),
        ...(waiting.length > 0
          ? [`  Overrides waiting for a model that is not listed: ${waiting.join(', ')}`]
          : []),
      ],
    };
  } catch (error) {
    return keep(`Discovery FAILED: ${describeError(error)}`);
  }
}

function writeJobSummary(
  reports: SourceReport[],
  history: string,
  dryRun: boolean,
  found: string[],
) {
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
  lines.push('', '### Model list', '', '```', ...found, '```');
  lines.push('', `History: ${history}`);
  appendFileSync(file, `${lines.join('\n')}\n`);
}

async function main() {
  try {
    process.loadEnvFile('.env');
  } catch {}

  const { sources, dryRun } = parseArgs(process.argv.slice(2));
  const overrides = readOverrides();

  const reports: SourceReport[] = [];
  const raws: Partial<Record<SourceId, unknown>> = {};
  for (const source of sources) {
    const report: SourceReport = {
      source,
      outcome: { status: 'failed', reason: 'unknown' },
      unmatched: [],
      warnings: [],
    };
    reports.push(report);
    const raw = await fetchSource(source, report);
    if (raw !== null) raws[source] = raw;
  }

  const { list, lines: found } = updateModelList(raws, overrides, dryRun);
  const entries = mergeModelList(list, overrides);
  console.log(`Listing ${entries.length} models.`);

  for (const report of reports) {
    if (report.source in raws) {
      writeSource(report.source, raws[report.source], entries, dryRun, report);
    }
  }

  printConsole(reports, dryRun);
  console.log(`${found.join('\n')}\n`);

  let history: string;
  try {
    history = recordHistory({ dryRun }).message;
  } catch (error) {
    history = `FAILED, nothing recorded. ${describeError(error)}`;
  }
  console.log(`History: ${history}\n`);
  writeJobSummary(reports, history, dryRun, found);
}

main().catch((error) => {
  console.error(describeError(error));
  process.exitCode = 1;
});
