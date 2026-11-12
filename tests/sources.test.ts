import { describe, expect, it } from 'vitest';
import { suggest } from '../scripts/lib/candidates';
import { aaAdapter } from '../scripts/sources/aa';
import { arenaAdapter } from '../scripts/sources/arena';
import { categoryChanges, latestRelease, livebenchAdapter } from '../scripts/sources/livebench';
import { modelsdevAdapter } from '../scripts/sources/modelsdev';
import { matchKey, openrouterAdapter, rankingWindow } from '../scripts/sources/openrouter';
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
  const row = (name: string, rating: number, category = 'overall') => ({
    model_name: name,
    rating,
    category,
    leaderboard_publish_date: '2026-11-09',
  });
  const agentRow = (name: string, score: number) => ({
    model_name: name,
    score,
    category: 'overall',
    leaderboard_publish_date: '2026-11-08',
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
    arena_agent: [
      agentRow('Claude Opus 5.5 (Max)', 0.1995562589597002),
      agentRow('Claude Opus 5 (Max)', 0.07495110951590737),
    ],
  };

  it('reads each board through its own mapping and measures the frontier and zero point on the full board', () => {
    const { snapshot, unmatched } = arenaAdapter.transform(raw, [
      tracked('anthropic/claude-opus-5-5', 'Claude Opus 5.5', {
        arena_text: 'Claude Opus 5.5 (High)',
        arena_webdev: 'Claude Opus 5.5 (Max)',
        arena_agent: 'Claude Opus 5.5 (Max)',
      }),
      tracked('anthropic/claude-opus-5', 'Claude Opus 5', {
        arena_text: 'Claude Opus 5 (Max)',
        arena_webdev: 'Claude Opus 5 (Max)',
        arena_agent: 'Claude Opus 5 (Max)',
      }),
    ]);
    expect(snapshot.total).toBe(4);
    expect(snapshot.frontier).toEqual({
      arena_text: 1538.28,
      arena_webdev: 1817.7,
      arena_agent: 0.1996,
    });
    expect(snapshot.floor).toEqual({ arena_agent: 0.1123 });
    expect(snapshot.models).toEqual({
      'Claude Opus 5.5 (High)': {
        arena_text: 1513,
        arena_webdev: null,
        arena_agent: null,
        published: '2026-11-09',
      },
      'Claude Opus 5.5 (Max)': {
        arena_text: null,
        arena_webdev: 1817.7,
        arena_agent: 0.1996,
        published: '2026-11-09',
      },
      'Claude Opus 5 (Max)': {
        arena_text: 1506.3,
        arena_webdev: 1700.4,
        arena_agent: 0.075,
        published: '2026-11-09',
      },
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
      { field: 'sources.arena_agent', value: null },
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
        {
          ...raw,
          arena_agent: raw.arena_agent.map(({ score, ...rest }) => ({ ...rest, rating: score })),
        },
        [],
      ),
    ).toThrow();
    expect(() =>
      arenaAdapter.transform(
        { ...raw, arena_webdev: [{ nope: 1 }, { nope: 2 }, raw.arena_webdev[0]] },
        [],
      ),
    ).toThrow();
  });
});

describe('Artificial Analysis adapter', () => {
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
    expect(snapshot.models).toEqual({
      'glm-5-3': { name: 'GLM-5.3 (Max)', aa_intelligence: 31.7, index_cost_usd: 3495.62 },
    });
    expect(unmatched).toEqual([]);
    expect(warnings).toEqual([]);
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
    expect(snapshotSchemas.aa.safeParse(old).success).toBe(true);
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

describe('LiveBench adapter', () => {
  const categories = {
    'Long Agentic': ['long_agentic'],
    Reasoning: ['reasoning'],
    Coding: ['coding'],
    Browser: ['browser'],
    'Data Analysis': ['data_analysis'],
    Research: ['research'],
    Design: ['design'],
    _overall_weights: { 'Long Agentic': 2, Coding: 1.5, Design: 1.5 },
  };
  const table = [
    'model,long_agentic,reasoning,coding,browser,data_analysis,research,design',
    'leader,80,90,70,60,70,80,90',
    'gpt-6.1-sol,99,70,99,60,50,40,80',
    'partial,,50,n/a,,,,',
    'coder,90,,90,,,,',
    'unscored,,,,,,,',
    '',
  ].join('\n');
  const raw = { release: '20261106', table, categories };

  it('finds the newest release in the site script', () => {
    const script = 'const a=["x","y"],r=["20261014","20261106","20261025"];fetch("./data/"+e)';
    expect(latestRelease(script)).toBe('20261106');
    expect(() => latestRelease('const r=[];')).toThrow(/No release/);
  });

  it('scores only the categories the AA index does not test', () => {
    const { snapshot, unmatched, warnings } = livebenchAdapter.transform(raw, [
      tracked('openai/gpt-6.1-sol', 'GPT-6.1 Sol', { livebench: 'gpt-6.1-sol' }),
    ]);
    expect(snapshot.total).toBe(3);
    expect(snapshot.edition).toBe('2026-11-06');
    expect(snapshot.frontier).toEqual({ livebench: 79.09 });
    expect(snapshot.models).toEqual({ 'gpt-6.1-sol': { livebench: 61.82 } });
    expect(unmatched).toEqual([]);
    expect(warnings).toEqual([]);
    expect(snapshotSchemas.livebench.safeParse(withTimestamp(snapshot)).success).toBe(true);
  });

  it('leaves blank and n/a cells out of the mean', () => {
    const { snapshot } = livebenchAdapter.transform(raw, [
      tracked('acme/partial', 'Partial', { livebench: 'partial' }),
    ]);
    expect(snapshot.models).toEqual({ partial: { livebench: 50 } });
  });

  it('reports a model it cannot find, with candidates', () => {
    const { snapshot, unmatched } = livebenchAdapter.transform(raw, [
      tracked('openai/gpt-6.1-sol', 'GPT-6.1 Sol', { livebench: 'gpt-6-1-sol' }),
    ]);
    expect(snapshot.models).toEqual({});
    expect(unmatched[0]).toMatchObject({ field: 'sources.livebench', value: 'gpt-6-1-sol' });
    expect(unmatched[0]?.candidates).toContain('gpt-6.1-sol');
  });

  it('stops when the categories or their weights change', () => {
    const { _overall_weights: weights, Browser: _browser, ...rest } = categories;
    expect(() =>
      livebenchAdapter.transform({ ...raw, categories: { ...categories, Math: ['math'] } }, []),
    ).toThrow(/new: Math/);
    expect(() =>
      livebenchAdapter.transform(
        { ...raw, categories: { ...categories, _overall_weights: { ...weights, Design: 2 } } },
        [],
      ),
    ).toThrow(/Design weighs 2, not 1.5/);
    expect(() =>
      livebenchAdapter.transform(
        { ...raw, categories: { ...rest, _overall_weights: weights } },
        [],
      ),
    ).toThrow(/gone: Browser/);
    expect(categoryChanges({ A: 1, B: 2 }, { A: 1, B: 2 })).toEqual([]);
  });

  it('refuses data it cannot read', () => {
    expect(() => livebenchAdapter.transform({ ...raw, table: 'name,coding\nx,1' }, [])).toThrow(
      /model/,
    );
    expect(() => livebenchAdapter.transform({ ...raw, table: 'model,coding\nx,1' }, [])).toThrow(
      /No kept category/,
    );
    expect(() => livebenchAdapter.transform({ ...raw, release: 'latest' }, [])).toThrow();
    expect(() => livebenchAdapter.transform(table, [])).toThrow();
  });
});

describe('OpenRouter adapter', () => {
  const days = ['2026-11-04', '2026-11-05', '2026-11-06'];
  const daily: Record<string, number> = {
    'openai/gpt-6.1-sol-20260929': 100,
    'anthropic/claude-opus-5.5-20260921': 60,
    'z-ai/glm-5.3-20260816': 50,
    'meta/muse-spark-1.3-contributor-20260902': 40,
    'deepseek/deepseek-v4-pro-20260813': 30,
    'deepseek/deepseek-v4-pro-20260423': 20,
    'nvidia/nemotron-20260604:free': 10,
    other: 999,
  };
  const rows = [
    ...days.flatMap((date) =>
      Object.entries(daily).map(([slug, tokens]) => ({
        date,
        model_permaslug: slug,
        total_tokens: String(tokens),
      })),
    ),
    {
      date: '2026-11-06',
      model_permaslug: 'anthropic/claude-fable-5.2-20261109',
      total_tokens: '500',
    },
  ];
  const raw = (data: unknown[] = rows) => ({
    window: { start: '2026-11-04', end: '2026-11-06' },
    body: {
      data,
      meta: { as_of: '2026-11-07T01:00:00.000Z', version: 'v1', start_date: '2026-11-04' },
    },
  });

  it('sums the window, ranks by tokens and ranks only models present every day', () => {
    const { snapshot } = openrouterAdapter.transform(raw(), [
      tracked('openai/gpt-6.1-sol', 'GPT-6.1 Sol'),
      tracked('anthropic/claude-fable-5-2', 'Claude Fable 5.2'),
    ]);
    expect(snapshot.total).toBe(8);
    expect(snapshot.edition).toBe('2026-11-04/2026-11-06');
    expect(snapshot.as_of).toBe('2026-11-07T01:00:00.000Z');
    expect(snapshot.models).toEqual({
      'openai/gpt-6.1-sol': {
        permaslug: 'openai/gpt-6.1-sol-20260929',
        tokens: 300,
        days: 3,
        rank: 2,
      },
      'anthropic/claude-fable-5-2': {
        permaslug: 'anthropic/claude-fable-5.2-20261109',
        tokens: 500,
        days: 1,
        rank: null,
      },
    });
    expect(() =>
      snapshotSchemas.openrouter.parse(withTimestamp({ ...snapshot, models: snapshot.models })),
    ).not.toThrow();
  });

  it('matches exactly across vendor names, dots and build dates, never by prefix', () => {
    const { snapshot, unmatched } = openrouterAdapter.transform(raw(), [
      tracked('zai/glm-5.3', 'GLM-5.3'),
      tracked('anthropic/claude-opus-5-5', 'Claude Opus 5.5'),
      tracked('anthropic/claude-opus-5', 'Claude Opus 5'),
      tracked('meta/muse-spark-1.3', 'Muse Spark 1.3'),
      tracked('nvidia/nemotron', 'Nemotron'),
    ]);
    expect(Object.keys(snapshot.models).sort()).toEqual([
      'anthropic/claude-opus-5-5',
      'zai/glm-5.3',
    ]);
    expect(unmatched).toEqual([]);
  });

  it('reports several builds instead of picking one, and honours a pinned build or null', () => {
    const { snapshot, unmatched } = openrouterAdapter.transform(raw(), [
      tracked('deepseek/deepseek-v4-pro', 'DeepSeek V4 Pro'),
      tracked('deepseek/pinned', 'DeepSeek V4 Pro 0813', {
        openrouter: 'deepseek/deepseek-v4-pro-20260813',
      }),
      tracked('openai/gpt-6.1-sol', 'GPT-6.1 Sol', { openrouter: null }),
    ]);
    expect(snapshot.models).toEqual({
      'deepseek/pinned': {
        permaslug: 'deepseek/deepseek-v4-pro-20260813',
        tokens: 90,
        days: 3,
        rank: 6,
      },
    });
    expect(unmatched.map(({ field, value, candidates }) => ({ field, value, candidates }))).toEqual(
      [
        {
          field: 'sources.openrouter',
          value: 'deepseek/deepseek-v4-pro',
          candidates: ['deepseek/deepseek-v4-pro-20260813', 'deepseek/deepseek-v4-pro-20260423'],
        },
      ],
    );
  });

  it('refuses a window with a missing day or data it cannot read', () => {
    expect(() =>
      openrouterAdapter.transform(raw(rows.filter((row) => row.date !== '2026-11-05')), []),
    ).toThrow(/Only 2 of the 3 days/);
    expect(() => openrouterAdapter.transform({ window: {}, body: {} }, [])).toThrow(
      /Unexpected response shape/,
    );
    expect(() =>
      openrouterAdapter.transform(raw(rows.map((row) => ({ ...row, total_tokens: 'lots' }))), []),
    ).toThrow(/failed validation/);
  });

  it('asks for the seven whole UTC days before today', () => {
    expect(rankingWindow(new Date('2026-11-12T03:00:00.000Z'))).toEqual({
      start: '2026-11-05',
      end: '2026-11-11',
    });
  });

  it('normalises IDs for matching', () => {
    expect(matchKey('xai/grok-4.7')).toBe('x-ai/grok-4-7');
    expect(matchKey('x-ai/grok-4.7-20260916')).toBe('x-ai/grok-4-7');
    expect(matchKey('minimax/MiniMax-M3.1-Flash')).toBe('minimax/minimax-m3-1-flash');
    expect(matchKey('openai/gpt-4o-2024-05-13')).toBe('openai/gpt-4o');
  });

  it('skips instead of failing when there is no API key', async () => {
    expect(await openrouterAdapter.fetch({ env: {} })).toEqual({
      skip: 'OPENROUTER_API_KEY is not set.',
    });
  });
});
