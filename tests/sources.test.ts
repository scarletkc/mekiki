import { describe, expect, it } from 'vitest';
import { suggest } from '../scripts/lib/candidates';
import { aaAdapter, tokenUse } from '../scripts/sources/aa';
import { arenaAdapter } from '../scripts/sources/arena';
import { modelsdevAdapter } from '../scripts/sources/modelsdev';
import type { TrackedModel } from '../scripts/sources/types';
import { snapshotSchemas } from '@/lib/snapshots';

const withTimestamp = <T extends object>(snapshot: T) => ({
  ...snapshot,
  fetched_at: '2026-11-11T00:00:00.000Z',
});

const tracked = (
  id: string,
  name: string,
  sources: TrackedModel['sources'] = {},
): TrackedModel => ({
  id,
  name,
  sources,
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
    const { snapshot, unmatched } = modelsdevAdapter.transform(raw, [
      tracked('anthropic/claude-sonnet-5-5', 'Claude Sonnet 5.5'),
    ]);
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
      tracked('anthropic/claude-sonnet-5-5', 'x', { modelsdev: 'reseller/claude-sonnet-5-5' }),
    ]);
    expect(snapshot.models['reseller/claude-sonnet-5-5']?.input).toBe(3);
  });

  it('reports models it cannot find, with candidates, and never guesses', () => {
    const { snapshot, unmatched } = modelsdevAdapter.transform(raw, [
      tracked('anthropic/claude-sonnet-5.5', 'Claude Sonnet 5.5'),
    ]);
    expect(snapshot.models).toEqual({});
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]).toMatchObject({
      field: 'sources.modelsdev',
      value: 'anthropic/claude-sonnet-5.5',
    });
    expect(unmatched[0]?.candidates).toContain('anthropic/claude-sonnet-5-5');
  });

  it('keeps a model without a price and warns', () => {
    const { snapshot, warnings } = modelsdevAdapter.transform(raw, [
      tracked('anthropic/no-price', 'No Price'),
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
  // Rows as hyparquet returns them, taken from the live files. The two
  // boards list different reasoning levels of the same model.
  const row = (name: string, rating: number, category = 'overall') => ({
    model_name: name,
    rating,
    category,
    leaderboard_publish_date: '2026-11-09',
  });
  const raw = {
    arena_text: [
      row('Gemini 4 Carbon (High)', 1538.2768191996465),
      row('Claude Opus 5.5 (High)', 1513.0021399366474),
      row('Claude Opus 5 (Max)', 1506.3),
      row('Claude Opus 5 (High)', 1502.3),
      row('Claude Opus 5 (High)', 1611.1, 'coding'),
    ],
    arena_webdev: [
      row('Claude Opus 5.5 (Max)', 1817.7),
      row('Claude Opus 5 (Max)', 1700.4),
      row('Claude Opus 5 (Max)', 1650, 'webdev-react'),
    ],
  };

  it('reads each board through its own mapping and takes the frontier from the full board', () => {
    const { snapshot, unmatched } = arenaAdapter.transform(raw, [
      tracked('anthropic/claude-opus-5-5', 'Claude Opus 5.5', {
        arena_text: 'Claude Opus 5.5 (High)',
        arena_webdev: 'Claude Opus 5.5 (Max)',
      }),
      tracked('anthropic/claude-opus-5', 'Claude Opus 5', {
        arena_text: 'Claude Opus 5 (Max)',
        arena_webdev: 'Claude Opus 5 (Max)',
      }),
    ]);
    expect(snapshot.total).toBe(4);
    expect(snapshot.frontier).toEqual({ arena_text: 1538.28, arena_webdev: 1817.7 });
    expect(snapshot.models).toEqual({
      'Claude Opus 5.5 (High)': { arena_text: 1513, arena_webdev: null, published: '2026-11-09' },
      'Claude Opus 5.5 (Max)': { arena_text: null, arena_webdev: 1817.7, published: '2026-11-09' },
      // Same name on both boards: one entry carrying both ratings.
      'Claude Opus 5 (Max)': { arena_text: 1506.3, arena_webdev: 1700.4, published: '2026-11-09' },
    });
    expect(unmatched).toEqual([]);
    expect(snapshotSchemas.arena.safeParse(withTimestamp(snapshot)).success).toBe(true);
  });

  it('matches names exactly and lists every reasoning level as a candidate', () => {
    const { snapshot, unmatched } = arenaAdapter.transform(raw, [
      tracked('anthropic/claude-opus-5', 'Claude Opus 5', { arena_text: 'claude opus 5 (high)' }),
    ]);
    expect(snapshot.models).toEqual({});
    expect(unmatched.map(({ field, value }) => ({ field, value }))).toEqual([
      { field: 'sources.arena_text', value: 'claude opus 5 (high)' },
      { field: 'sources.arena_webdev', value: null },
    ]);
    expect(unmatched[0]?.candidates.slice(0, 2).sort()).toEqual([
      'Claude Opus 5 (High)',
      'Claude Opus 5 (Max)',
    ]);
    expect(unmatched[1]?.candidates[0]).toBe('Claude Opus 5 (Max)');
  });

  it('refuses a payload where a board is missing, empty or mostly invalid', () => {
    expect(() => arenaAdapter.transform(raw.arena_text, [])).toThrow();
    expect(() => arenaAdapter.transform({ arena_text: raw.arena_text }, [])).toThrow();
    expect(() => arenaAdapter.transform({ ...raw, arena_webdev: [] }, [])).toThrow();
    expect(() =>
      arenaAdapter.transform(
        { ...raw, arena_webdev: [{ nope: 1 }, { nope: 2 }, raw.arena_webdev[0]] },
        [],
      ),
    ).toThrow();
  });
});

describe('Artificial Analysis adapter', () => {
  // The example response from the API reference, verbatim, plus two more models.
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

  it('maps the documented fields and ignores the indexes that are not used', () => {
    const { snapshot, unmatched, warnings } = aaAdapter.transform(raw, [
      tracked('zai/glm-5.3', 'GLM-5.3', { aa: 'glm-5-3' }),
    ]);
    expect(snapshot.total).toBe(3);
    expect(snapshot.frontier).toEqual({ aa_intelligence: 70.2 });
    // Only GLM-5.3 has a run cost, so it is the whole reference group.
    expect(snapshot.reference).toEqual({ index_token_use: 1630, index_token_use_models: 1 });
    expect(snapshot.models).toEqual({
      'glm-5-3': {
        name: 'GLM-5.3 (Max)',
        aa_intelligence: 31.7,
        index_cost_usd: 3495.62,
        // 3495.62 ÷ ((3 × 1.4 + 4.4) ÷ 4) = 1625.9 million tokens
        index_token_use: 1626,
      },
    });
    expect(unmatched).toEqual([]);
    expect(warnings).toEqual([]);
    expect(snapshotSchemas.aa.safeParse(withTimestamp(snapshot)).success).toBe(true);
  });

  it('derives token use from the run cost and the list price', () => {
    expect(tokenUse(8, 1, 5)).toBe(4);
    expect(tokenUse(8, 0, 0)).toBeNull();
    expect(tokenUse(0, 1, 5)).toBeNull();
    expect(tokenUse(null, 1, 5)).toBeNull();
    expect(tokenUse(8, 1, undefined)).toBeNull();
  });

  it('takes typical token use from the leaders, not from the whole board', () => {
    // 60 models; model n scores n and burns 10 × n million tokens at $1 per million.
    const board = Array.from({ length: 60 }, (_, index) => ({
      slug: `m${index + 1}`,
      evaluations: { artificial_analysis_intelligence_index: index + 1 },
      artificial_analysis_intelligence_index_cost: { total_cost: 10 * (index + 1) },
      pricing: { price_1m_input_tokens: 1, price_1m_output_tokens: 1 },
    }));
    const { snapshot, notes } = aaAdapter.transform(board, []);
    // The top 50 are models 11 to 60: median (350 + 360) ÷ 2. All 60 would give 305.
    expect(snapshot.reference).toEqual({ index_token_use: 355, index_token_use_models: 50 });
    expect(notes?.join(' ')).toContain('355');
  });

  it('has no typical token use when no model has a run cost and a price', () => {
    const { snapshot, warnings } = aaAdapter.transform(
      [{ slug: 'a', evaluations: { artificial_analysis_intelligence_index: 50 } }],
      [],
    );
    expect(snapshot.reference).toEqual({ index_token_use: null, index_token_use_models: 0 });
    expect(warnings.join(' ')).toContain('token use');
    expect(snapshotSchemas.aa.safeParse(withTimestamp(snapshot)).success).toBe(true);
  });

  it('suggests slugs for an unmapped model by slug and by display name', () => {
    const { unmatched } = aaAdapter.transform(raw, [tracked('zai/glm-5.3', 'GLM-5.3')]);
    expect(unmatched[0]).toMatchObject({ field: 'sources.aa', value: null });
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

  it('still reads a snapshot written before the coding index was dropped', () => {
    const old = {
      source: 'aa',
      fetched_at: '2026-11-10T17:32:29.633Z',
      total: 734,
      frontier: { aa_intelligence: 64.6, aa_coding: null },
      models: { x: { name: 'X', aa_intelligence: 50, aa_coding: null, index_cost_usd: 10 } },
    };
    const parsed = snapshotSchemas.aa.safeParse(old);
    expect(parsed.success).toBe(true);
    // Written before token use was recorded: no reference, and null per model.
    expect(parsed.data?.reference).toBeUndefined();
    expect(parsed.data?.models.x?.index_token_use).toBeNull();
  });
});

describe('suggest', () => {
  it('returns nothing when nothing is close', () => {
    expect(
      suggest({ id: 'a/b', name: 'Totally Different' }, [{ id: 'GPT-6.1 Sol (Max)' }]),
    ).toEqual([]);
  });

  it('ranks the closest name first', () => {
    const pool = ['GPT-6 Sol (Max)', 'GPT-6.1 Sol (Max)', 'GPT-5.6 Terra (xHigh)'].map((id) => ({
      id,
    }));
    expect(suggest({ id: 'openai/gpt-6.1-sol', name: 'GPT-6.1 Sol' }, pool)[0]).toBe(
      'GPT-6.1 Sol (Max)',
    );
  });
});
