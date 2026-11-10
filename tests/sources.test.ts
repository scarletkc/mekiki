import { describe, expect, it } from 'vitest';
import { suggest } from '../scripts/lib/candidates';
import { aaAdapter } from '../scripts/sources/aa';
import { arenaAdapter } from '../scripts/sources/arena';
import { modelsdevAdapter } from '../scripts/sources/modelsdev';
import type { TrackedModel } from '../scripts/sources/types';
import { snapshotSchemas } from '@/lib/snapshots';

const withTimestamp = <T extends object>(snapshot: T) => ({
  ...snapshot,
  fetched_at: '2026-11-11T00:00:00.000Z',
});

describe('models.dev adapter', () => {
  // Trimmed copy of a real api.json entry, plus noise the adapter must tolerate.
  const raw = {
    anthropic: {
      id: 'anthropic',
      name: 'Anthropic',
      models: {
        'claude-sonnet-5-5': {
          id: 'claude-sonnet-5-5',
          name: 'Claude Sonnet 5.5',
          release_date: '2026-09-28',
          modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
          open_weights: false,
          limit: { context: 1000000, output: 128000 },
          cost: { input: 2, output: 10, cache_read: 0.1, cache_write: 2.5 },
        },
        'no-price': { id: 'no-price', name: 'No Price', limit: { context: 8000 } },
      },
    },
    reseller: {
      id: 'reseller',
      models: {
        'claude-sonnet-5-5': { name: 'Claude Sonnet 5.5', cost: { input: 3, output: 15 } },
        broken: { name: 42, cost: 'free' },
      },
    },
  };

  it('keeps only tracked models and reads the price from the mapped provider', () => {
    const tracked: TrackedModel[] = [
      { id: 'anthropic/claude-sonnet-5-5', name: 'Claude Sonnet 5.5', sourceId: null },
    ];
    const { snapshot, unmatched } = modelsdevAdapter.transform(raw, tracked);
    expect(snapshot.total).toBe(4);
    expect(snapshot.models).toEqual({
      'anthropic/claude-sonnet-5-5': {
        name: 'Claude Sonnet 5.5',
        input: 2,
        output: 10,
        cache_read: 0.1,
        context: 1000000,
        release_date: '2026-09-28',
        open_weights: false,
        modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
      },
    });
    expect(unmatched).toEqual([]);
    expect(snapshotSchemas.modelsdev.safeParse(withTimestamp(snapshot)).success).toBe(true);
  });

  it('honours an explicit mapping to another provider', () => {
    const { snapshot } = modelsdevAdapter.transform(raw, [
      { id: 'anthropic/claude-sonnet-5-5', name: 'x', sourceId: 'reseller/claude-sonnet-5-5' },
    ]);
    expect(snapshot.models['reseller/claude-sonnet-5-5']?.input).toBe(3);
  });

  it('reports models it cannot find, with candidates, and never guesses', () => {
    const { snapshot, unmatched } = modelsdevAdapter.transform(raw, [
      { id: 'anthropic/claude-sonnet-5.5', name: 'Claude Sonnet 5.5', sourceId: null },
    ]);
    expect(snapshot.models).toEqual({});
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]?.reason).toBe('not_found');
    expect(unmatched[0]?.candidates).toContain('anthropic/claude-sonnet-5-5');
  });

  it('keeps a model without a price and warns', () => {
    const { snapshot, warnings } = modelsdevAdapter.transform(raw, [
      { id: 'anthropic/no-price', name: 'No Price', sourceId: null },
    ]);
    expect(snapshot.models['anthropic/no-price']).toMatchObject({ input: null, output: null });
    expect(warnings.join(' ')).toContain('no input/output price');
  });

  it('is not broken by a malformed entry nobody tracks', () => {
    expect(() => modelsdevAdapter.transform(raw, [])).not.toThrow();
  });

  it('rejects a payload with the wrong shape', () => {
    expect(() => modelsdevAdapter.transform([], [])).toThrow();
    expect(() => modelsdevAdapter.transform({ anthropic: 'nope' }, [])).toThrow();
  });
});

describe('Arena adapter', () => {
  // Rows as hyparquet returns them, taken from the live file.
  const rows = [
    { model_name: 'Gemini 4 Carbon (High)', rating: 1538.2768191996465, category: 'overall', leaderboard_publish_date: '2026-11-09' },
    { model_name: 'Claude Opus 5 (Max)', rating: 1506.3, category: 'overall', leaderboard_publish_date: '2026-11-09' },
    { model_name: 'Claude Opus 5 (High)', rating: 1502.3, category: 'overall', leaderboard_publish_date: '2026-11-09' },
    { model_name: 'Claude Opus 5 (High)', rating: 1611.1, category: 'coding', leaderboard_publish_date: '2026-11-09' },
  ];

  it('uses only the overall category and takes the frontier from the full board', () => {
    const { snapshot, unmatched } = arenaAdapter.transform(rows, [
      { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5', sourceId: 'Claude Opus 5 (High)' },
    ]);
    expect(snapshot.total).toBe(3);
    expect(snapshot.frontier).toEqual({ arena_text: 1538.28 });
    expect(snapshot.models).toEqual({
      'Claude Opus 5 (High)': { arena_text: 1502.3, published: '2026-11-09' },
    });
    expect(unmatched).toEqual([]);
    expect(snapshotSchemas.arena.safeParse(withTimestamp(snapshot)).success).toBe(true);
  });

  it('matches names exactly and lists every reasoning level as a candidate', () => {
    const { snapshot, unmatched } = arenaAdapter.transform(rows, [
      { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5', sourceId: null },
      { id: 'x/y', name: 'Other', sourceId: 'claude opus 5 (high)' },
    ]);
    expect(snapshot.models).toEqual({});
    expect(unmatched.map((item) => item.reason)).toEqual(['unmapped', 'not_found']);
    expect(unmatched[0]?.candidates.slice(0, 2).sort()).toEqual([
      'Claude Opus 5 (High)',
      'Claude Opus 5 (Max)',
    ]);
  });

  it('refuses a payload where most rows are invalid', () => {
    expect(() => arenaAdapter.transform([{ nope: 1 }, { nope: 2 }, rows[0]], [])).toThrow();
    expect(() => arenaAdapter.transform({ rows }, [])).toThrow();
  });
});

describe('Artificial Analysis adapter', () => {
  // The example response from the API reference, verbatim, plus one more model.
  const raw = [
    {
      id: 'cd684ea4-b475-4269-b001-d469d06d8a7a',
      name: 'GLM-5.3 (Max)',
      slug: 'glm-5-3',
      release_date: '2026-08-18',
      model_creator: { id: '67437eb6-7dc1-4e93-befd-22c8b8ec2065', name: 'Z AI' },
      evaluations: {
        artificial_analysis_intelligence_index: 31.7,
        artificial_analysis_coding_index: null,
        artificial_analysis_agentic_index: null,
        artificial_analysis_finance_and_accounting_index: 42.1,
      },
      artificial_analysis_intelligence_index_cost: {
        total_cost: 3495.62,
        cost_per_task: { total_cost: 5.0093 },
      },
      pricing: { price_1m_input_tokens: 1.4, price_1m_output_tokens: 4.4 },
      performance: { median_output_tokens_per_second: 80.07 },
    },
    {
      id: 'x',
      name: 'Leader',
      slug: 'leader',
      evaluations: { artificial_analysis_intelligence_index: 70.2 },
      artificial_analysis_intelligence_index_cost: null,
    },
    { id: 'y', name: 'No scores yet', slug: 'unscored', evaluations: null },
  ];

  it('maps the documented fields and survives a null coding index', () => {
    const { snapshot, unmatched, warnings } = aaAdapter.transform(raw, [
      { id: 'zai/glm-5.3', name: 'GLM-5.3', sourceId: 'glm-5-3' },
    ]);
    expect(snapshot.total).toBe(3);
    expect(snapshot.frontier).toEqual({ aa_intelligence: 70.2, aa_coding: null });
    expect(snapshot.models).toEqual({
      'glm-5-3': {
        name: 'GLM-5.3 (Max)',
        aa_intelligence: 31.7,
        aa_coding: null,
        index_cost_usd: 3495.62,
      },
    });
    expect(unmatched).toEqual([]);
    expect(warnings.join(' ')).toContain('Coding Index');
    expect(snapshotSchemas.aa.safeParse(withTimestamp(snapshot)).success).toBe(true);
  });

  it('suggests slugs for an unmapped model by slug and by display name', () => {
    const { unmatched } = aaAdapter.transform(raw, [
      { id: 'zai/glm-5.3', name: 'GLM-5.3', sourceId: null },
    ]);
    expect(unmatched[0]?.reason).toBe('unmapped');
    expect(unmatched[0]?.candidates).toEqual(['glm-5-3']);
  });

  it('refuses data without any Intelligence Index', () => {
    expect(() => aaAdapter.transform([{ slug: 'a' }, { slug: 'b' }], [])).toThrow();
    expect(() => aaAdapter.transform({ data: raw }, [])).toThrow();
  });

  it('skips instead of failing when there is no API key', async () => {
    expect(await aaAdapter.fetch({ env: {} })).toEqual({ skip: 'AA_API_KEY is not set.' });
    expect(await aaAdapter.fetch({ env: { AA_API_KEY: '  ' } })).toEqual({
      skip: 'AA_API_KEY is not set.',
    });
  });
});

describe('suggest', () => {
  it('returns nothing when nothing is close', () => {
    expect(suggest({ id: 'a/b', name: 'Totally Different' }, [{ id: 'GPT-6.1 Sol (Max)' }])).toEqual([]);
  });

  it('ranks the closest name first', () => {
    const pool = ['GPT-6 Sol (Max)', 'GPT-6.1 Sol (Max)', 'GPT-5.6 Terra (xHigh)'].map((id) => ({ id }));
    expect(suggest({ id: 'openai/gpt-6.1-sol', name: 'GPT-6.1 Sol' }, pool)[0]).toBe('GPT-6.1 Sol (Max)');
  });
});
