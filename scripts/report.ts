/**
 * `pnpm report`: prints every model's scores and the tier distribution,
 * from the same dataset the site and the API use. Meant for calibrating
 * the thresholds in src/lib/scoring.config.ts (docs/SPEC.md §6.4).
 */
import { buildDataset, type ModelRecord } from '../src/lib/dataset';
import {
  COST_TIERS,
  INTELLIGENCE_TIERS,
  METRIC_KEYS,
  VALUE_TIERS,
  scoringConfig,
} from '../src/lib/scoring.config';
import { SOURCE_IDS, loadSnapshots } from '../src/lib/snapshots';
import { readModelEntries } from './lib/content';

type Align = 'left' | 'right';
interface Column {
  title: string;
  align?: Align;
  value: (model: ModelRecord) => string;
}

const dash = '–';
const number = (value: number | null, digits = 1) =>
  value === null ? dash : value.toFixed(digits);
const price = (value: number | null) =>
  value === null ? dash : `$${Number(value.toFixed(4)).toString()}`;

function table(rows: string[][], aligns: Align[]): string {
  const widths = rows[0]!.map((_, column) => Math.max(...rows.map((row) => row[column]!.length)));
  return rows
    .map((row, index) => {
      const line = row
        .map((cell, column) =>
          aligns[column] === 'right'
            ? cell.padStart(widths[column]!)
            : cell.padEnd(widths[column]!),
        )
        .join('  ')
        .trimEnd();
      return index === 0 ? `${line}\n${widths.map((width) => '-'.repeat(width)).join('  ')}` : line;
    })
    .join('\n');
}

function quantiles(values: number[]): string {
  if (values.length === 0) return 'no scores';
  const sorted = [...values].sort((a, b) => a - b);
  const at = (share: number) => {
    const position = share * (sorted.length - 1);
    const low = Math.floor(position);
    const high = Math.ceil(position);
    return sorted[low]! + (sorted[high]! - sorted[low]!) * (position - low);
  };
  return [
    `n=${sorted.length}`,
    `min ${at(0).toFixed(1)}`,
    `p25 ${at(0.25).toFixed(1)}`,
    `median ${at(0.5).toFixed(1)}`,
    `p75 ${at(0.75).toFixed(1)}`,
    `max ${at(1).toFixed(1)}`,
  ].join('  ');
}

function distribution(title: string, tiers: readonly string[], values: (string | null)[]): string {
  const rows = [['tier', 'models', '']];
  for (const tier of [...tiers, null]) {
    const count = values.filter((value) => value === tier).length;
    rows.push([tier ?? '(not rated)', String(count), '#'.repeat(count)]);
  }
  return `${title}\n${table(rows, ['left', 'right', 'left'])}`;
}

const dataset = buildDataset(readModelEntries(), loadSnapshots());
const { models } = dataset;

const columns: Column[] = [
  { title: 'model', value: (m) => m.id },
  { title: 'status', value: (m) => m.status },
  ...METRIC_KEYS.map(
    (key): Column => ({
      title: key,
      align: 'right',
      value: (m) => {
        const { raw, normalized } = m.rating.intelligence.breakdown[key];
        return raw === null ? dash : `${raw} (${number(normalized)})`;
      },
    }),
  ),
  { title: 'bench', align: 'right', value: (m) => number(m.rating.intelligence.benchmark) },
  { title: 'subj', align: 'right', value: (m) => number(m.rating.intelligence.subjective) },
  { title: 'basis', value: (m) => m.rating.intelligence.basis },
  { title: 'intel', align: 'right', value: (m) => number(m.rating.intelligence.score) },
  { title: 'tier', value: (m) => m.rating.intelligence.tier ?? dash },
  { title: 'in', align: 'right', value: (m) => price(m.rating.cost.input) },
  { title: 'out', align: 'right', value: (m) => price(m.rating.cost.output) },
  { title: 'blended', align: 'right', value: (m) => price(m.rating.cost.blended) },
  { title: 'cost idx', align: 'right', value: (m) => number(m.rating.cost.index) },
  { title: 'tier', value: (m) => m.rating.cost.tier ?? dash },
  { title: 'value', align: 'right', value: (m) => number(m.rating.value.score) },
  { title: 'tier', value: (m) => m.rating.value.tier ?? dash },
];

console.log(`\nmekiki report: ${models.length} models\n`);

console.log('Sources');
for (const id of SOURCE_IDS) {
  const { name, fetched_at: fetchedAt } = dataset.sources[id];
  console.log(`  ${name}: ${fetchedAt ?? 'no snapshot'}`);
}
console.log(
  `  frontier: ${METRIC_KEYS.map((key) => `${key}=${dataset.frontier[key] ?? dash}`).join('  ')}`,
);

console.log('\nScores (benchmark columns show raw and normalised)\n');
console.log(
  table(
    [columns.map((column) => column.title), ...models.map((m) => columns.map((c) => c.value(m)))],
    columns.map((column) => column.align ?? 'left'),
  ),
);

const scores = (pick: (model: ModelRecord) => number | null) =>
  models.map(pick).filter((value): value is number => value !== null);

console.log('\nSpread');
console.log(`  intelligence  ${quantiles(scores((m) => m.rating.intelligence.score))}`);
console.log(`  blended $     ${quantiles(scores((m) => m.rating.cost.blended))}`);
console.log(`  cost index    ${quantiles(scores((m) => m.rating.cost.index))}`);
console.log(`  value         ${quantiles(scores((m) => m.rating.value.score))}`);

const { intelligence, cost, value } = scoringConfig;
console.log('');
console.log(
  distribution(
    `Intelligence tiers (top ≥ ${intelligence.tiers.top}, high ≥ ${intelligence.tiers.high}, mid ≥ ${intelligence.tiers.mid})`,
    INTELLIGENCE_TIERS,
    models.map((m) => m.rating.intelligence.tier),
  ),
);
console.log('');
console.log(
  distribution(
    `Cost tiers by blended price (low < $${cost.tiers.low}, mid < $${cost.tiers.mid}, high < $${cost.tiers.high})`,
    COST_TIERS,
    models.map((m) => m.rating.cost.tier),
  ),
);
console.log('');
console.log(
  distribution(
    `Value tiers (top ≥ ${value.tiers.top}, high ≥ ${value.tiers.high}, mid ≥ ${value.tiers.mid})`,
    VALUE_TIERS,
    models.map((m) => m.rating.value.tier),
  ),
);

const unmapped = models.filter((m) => !m.matched.modelsdev || !m.matched.aa || !m.matched.arena);
if (unmapped.length > 0) {
  console.log('\nMissing source data (run `pnpm sync` to see candidate names)');
  for (const model of unmapped) {
    const missing = SOURCE_IDS.filter((id) => !model.matched[id]);
    console.log(`  ${model.id}: ${missing.join(', ')}`);
  }
}
console.log('');
