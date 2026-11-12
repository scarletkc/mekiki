import { describe, expect, it } from 'vitest';
import type { ModelEntry } from '@/lib/model-schema';
import {
  aaBase,
  aaEntries,
  arenaEntries,
  compareWithList,
  discoverModels,
  livebenchIds,
  modelKey,
  modelsdevEntries,
  pickVariant,
  variantOf,
  type BoardEntry,
  type DiscoveryInput,
} from '../scripts/lib/discover';

describe('modelKey', () => {
  it('gives every spelling of a model the same key', () => {
    expect(modelKey('GPT-6.1 Sol (Max)')).toBe('gpt-6-1-sol');
    expect(modelKey('gpt-6-1-sol')).toBe('gpt-6-1-sol');
    expect(modelKey('gpt-6.1-sol')).toBe('gpt-6-1-sol');
    expect(modelKey('DeepSeek-V4-Pro (High, 20260813)')).toBe('deepseek-v4-pro');
    expect(modelKey('DeepSeek-V4.1-Flash-20261017 (Max)')).toBe('deepseek-v4-1-flash');
  });

  it('keeps what tells models apart', () => {
    expect(modelKey('Qwen3-Next-80B-A3B-Thinking')).not.toBe(
      modelKey('Qwen3-Next-80B-A3B-Instruct'),
    );
    expect(modelKey('Claude Opus 5')).not.toBe(modelKey('Claude Opus 5.5'));
  });
});

describe('variantOf', () => {
  it('reads the reasoning level, the build and anything else', () => {
    expect(variantOf('Claude Opus 5 (Max)')).toEqual({ effort: 7, date: null, other: [] });
    expect(variantOf('DeepSeek-V4-Pro (High, 20260813)')).toEqual({
      effort: 5,
      date: '20260813',
      other: [],
    });
    expect(variantOf('Grok 3 Preview (02-24)').date).toBe('02-24');
    expect(variantOf('Gemini 1.5 Pro (002)').date).toBe('002');
    expect(variantOf('GPT-5.6 Sol (xHigh, Codex Harness)')).toEqual({
      effort: 6,
      date: null,
      other: ['codex-harness'],
    });
    expect(variantOf('Llama 3.1 405B Instruct (FP8)').other).toEqual([]);
    expect(variantOf('Claude Sonnet 4.6')).toEqual({ effort: null, date: null, other: [] });
  });
});

describe('pickVariant', () => {
  const entry = (name: string, score = 0) => ({ name, score });

  it('takes the highest reasoning level', () => {
    expect(
      pickVariant([entry('X (High)', 1500), entry('X (Max)', 1490), entry('X (Low)', 1510)])?.name,
    ).toBe('X (Max)');
  });

  it('puts a name without a level between medium and high', () => {
    expect(pickVariant([entry('X'), entry('X (Medium)')])?.name).toBe('X');
    expect(pickVariant([entry('X'), entry('X (High)')])?.name).toBe('X (High)');
  });

  it('then takes the latest build, then the higher score', () => {
    expect(pickVariant([entry('X (001)'), entry('X (002)')])?.name).toBe('X (002)');
    expect(pickVariant([entry('X (FP8)', 1), entry('X (BF16)', 2)])?.name).toBe('X (BF16)');
  });

  it('skips special setups, and leaves a model with only those to a human', () => {
    expect(pickVariant([entry('X (xHigh, Codex Harness)'), entry('X (High)')])?.name).toBe(
      'X (High)',
    );
    expect(pickVariant([entry('X (xHigh, Codex Harness)')])).toBeNull();
  });
});

describe('aaBase', () => {
  it('strips a reasoning-level suffix and ranks the bare slug first', () => {
    expect(aaBase('gpt-6-1-sol')).toEqual({ base: 'gpt-6-1-sol', rank: 8 });
    expect(aaBase('gpt-6-1-sol-low')).toEqual({ base: 'gpt-6-1-sol', rank: 2 });
    expect(aaBase('gpt-6-1-sol-non-reasoning').base).toBe('gpt-6-1-sol');
  });

  it('strips the suffix when the name puts the level in parentheses', () => {
    expect(aaBase('grok-4-6-xhigh', 'Grok 4.6 (Xhigh)')).toEqual({ base: 'grok-4-6', rank: 6 });
    expect(aaBase('kimi-k3-low', 'Kimi K3 (Low)')).toEqual({ base: 'kimi-k3', rank: 2 });
    expect(aaBase('glm-5-non-reasoning', 'GLM-5 (Non-reasoning)').base).toBe('glm-5');
  });

  it('keeps a suffix that is part of the model name', () => {
    expect(aaBase('qwen3-8-max', 'Qwen3.8 Max (0902)')).toEqual({ base: 'qwen3-8-max', rank: 8 });
    expect(aaBase('qwen3-8-max', 'Qwen3.8 Max 0902').base).toBe('qwen3-8-max');
    expect(aaBase('qwen3-8-max', 'Qwen3.8 Max (Max)').base).toBe('qwen3-8-max');
    expect(aaBase('phi-4-reasoning', 'Phi-4 Reasoning').base).toBe('phi-4-reasoning');
  });
});

describe('discoverModels', () => {
  const input: DiscoveryInput = {
    aa: [
      { slug: 'gpt-6-1-sol', name: 'GPT-6.1 Sol (Max)', creator: 'OpenAI', index: 54.6 },
      { slug: 'gpt-6-1-sol-low', name: 'GPT-6.1 Sol (Low)', creator: 'OpenAI', index: 40 },
      { slug: 'kimi-k3', name: 'Kimi K3', creator: 'Moonshot AI', index: 45 },
      { slug: 'only-on-aa', name: 'Only On AA', creator: 'Acme', index: 30 },
      { slug: 'unpriced', name: 'Unpriced', creator: 'Acme', index: 30 },
      { slug: 'no-index', name: 'No Index', creator: 'Acme', index: null },
    ],
    arena: {
      arena_text: [
        { name: 'GPT-6.1 Sol (Max)', org: 'openai', score: 1446 },
        { name: 'GPT-6.1 Sol (High)', org: 'openai', score: 1450 },
        { name: 'Kimi K3 (Max)', org: 'moonshot', score: 1420 },
        { name: 'Unpriced', org: 'acme', score: 1300 },
        { name: 'No Index', org: 'acme', score: 1300 },
      ],
      arena_webdev: [{ name: 'GPT-6.1 Sol (xHigh, Codex Harness)', org: 'openai', score: 1700 }],
      arena_agent: [{ name: 'GPT-6.1 Sol (Max)', org: 'openai', score: 0.125 }],
    },
    livebench: ['gpt-6.1-sol', 'kimi-k3-thinking'],
    modelsdev: [
      {
        provider: 'openai',
        providerName: 'OpenAI',
        id: 'gpt-6.1-sol',
        name: 'GPT-6.1 Sol',
        priced: true,
        release: '2026-10-01',
      },
      {
        provider: 'openrouter',
        providerName: 'OpenRouter',
        id: 'openai/gpt-6.1-sol',
        name: 'GPT-6.1 Sol',
        priced: true,
        release: null,
      },
      {
        provider: 'moonshotai',
        providerName: 'Moonshot AI',
        id: 'kimi-k3',
        name: 'Kimi K3',
        priced: true,
        release: '2026-08-01',
      },
      {
        provider: 'moonshotai',
        providerName: 'Moonshot AI',
        id: 'kimi-k3-20260801',
        name: 'Kimi K3',
        priced: true,
        release: '2026-08-01',
      },
      {
        provider: 'resale',
        providerName: 'Resale',
        id: 'unpriced',
        name: 'Unpriced',
        priced: true,
        release: null,
      },
      {
        provider: 'acme',
        providerName: 'Acme',
        id: 'unpriced',
        name: 'Unpriced',
        priced: false,
        release: null,
      },
    ],
  };
  const result = discoverModels(input);

  it('lists models with an AA index, an Arena board and an official price', () => {
    expect(result.models.map((model) => model.id)).toEqual([
      'moonshotai/kimi-k3',
      'openai/gpt-6.1-sol',
    ]);
  });

  it('maps every source to the highest level and leaves special setups empty', () => {
    expect(result.models.find((model) => model.id === 'openai/gpt-6.1-sol')).toEqual({
      id: 'openai/gpt-6.1-sol',
      name: 'GPT-6.1 Sol',
      vendor: 'OpenAI',
      release_date: '2026-10-01',
      sources: {
        modelsdev: 'openai/gpt-6.1-sol',
        aa: 'gpt-6-1-sol',
        arena_text: 'GPT-6.1 Sol (Max)',
        arena_webdev: null,
        arena_agent: 'GPT-6.1 Sol (Max)',
        livebench: 'gpt-6.1-sol',
      },
    });
    expect(result.ambiguous).toEqual([
      { field: 'arena_webdev', names: ['GPT-6.1 Sol (xHigh, Codex Harness)'] },
    ]);
  });

  it('finds the maker under an alias and prefers the undated ID', () => {
    const kimi = result.models.find((model) => model.id === 'moonshotai/kimi-k3');
    expect(kimi?.sources.modelsdev).toBe('moonshotai/kimi-k3');
    expect(kimi?.sources.livebench).toBeNull();
  });

  it('says why a model on AA and Arena was left out', () => {
    expect(result.rejects).toEqual([
      { key: 'unpriced', reason: 'no official price (maker acme; on models.dev at resale, acme)' },
    ]);
  });

  it('says why a priced model on Arena has no AA match', () => {
    const priced = (id: string) => ({
      provider: 'acme',
      providerName: 'Acme',
      id,
      name: id,
      priced: true,
      release: null,
    });
    const { rejects } = discoverModels({
      aa: [
        { slug: 'scored-1', name: 'Scored 1', creator: 'Acme', index: null },
        { slug: 'other-2-flash', name: 'Other 2 Flash', creator: 'Acme', index: 40 },
      ],
      arena: {
        arena_text: [
          { name: 'Scored 1', org: 'acme', score: 1 },
          { name: 'Other 2 Max', org: 'acme', score: 1 },
          { name: 'Unpriced 3', org: 'acme', score: 1 },
        ],
        arena_webdev: [],
        arena_agent: [],
      },
      livebench: [],
      modelsdev: [priced('scored-1'), priced('other-2-max'), priced('other-2-flash')],
    });
    expect(rejects).toEqual([
      { key: 'other-2-max', reason: "not on AA's list under this name (close: other-2-flash)" },
      { key: 'scored-1', reason: 'on AA (scored-1) without an Intelligence Index' },
    ]);
  });

  describe('a model whose name ends in a reasoning level', () => {
    const qwen = (id: string) => ({
      provider: 'alibaba',
      providerName: 'Alibaba',
      id,
      name: id,
      priced: true,
      release: null,
    });
    const boards = (text: BoardEntry[]) => ({
      arena_text: text,
      arena_webdev: [],
      arena_agent: [],
    });
    const max0902 = {
      slug: 'qwen3-8-max',
      name: 'Qwen3.8 Max (0902)',
      creator: 'Alibaba',
      index: 34,
    };

    it('matches the AA slug on its own', () => {
      const result = discoverModels({
        aa: [max0902],
        arena: boards([{ name: 'Qwen3.8-Max (0902)', org: 'alibaba', score: 1400 }]),
        livebench: [],
        modelsdev: [qwen('qwen3.8-max')],
      });
      expect(result.models.map((model) => [model.id, model.sources.aa])).toEqual([
        ['alibaba/qwen3.8-max', 'qwen3-8-max'],
      ]);
      expect(result.rejects).toEqual([]);
    });

    it('keeps another build of it apart', () => {
      const result = discoverModels({
        aa: [
          { slug: 'qwen3-8-max-0803', name: 'Qwen3.8 Max (0803)', creator: 'Alibaba', index: null },
          max0902,
        ],
        arena: boards([
          { name: 'Qwen3.8-Max (0902)', org: 'alibaba', score: 1400 },
          { name: 'Qwen3.8 Max 0803', org: 'alibaba', score: 1390 },
        ]),
        livebench: [],
        modelsdev: [qwen('qwen3.8-max'), qwen('qwen3.8-max-0803')],
      });
      expect(result.models.map((model) => [model.id, model.sources.aa])).toEqual([
        ['alibaba/qwen3.8-max', 'qwen3-8-max'],
      ]);
      expect(result.rejects).toEqual([
        {
          key: 'qwen3-8-max-0803',
          reason: 'on AA (qwen3-8-max-0803) without an Intelligence Index',
        },
      ]);
    });

    it('still reads real reasoning levels as one model', () => {
      const result = discoverModels({
        aa: [
          { slug: 'grok-4-6-xhigh', name: 'Grok 4.6 (Xhigh)', creator: 'xAI', index: 43 },
          {
            slug: 'claude-sonnet-5-low',
            name: 'Claude Sonnet 5 (Low)',
            creator: 'Anthropic',
            index: 30,
          },
          {
            slug: 'claude-sonnet-5',
            name: 'Claude Sonnet 5 (Max)',
            creator: 'Anthropic',
            index: 50,
          },
          {
            slug: 'claude-sonnet-5-xhigh',
            name: 'Claude Sonnet 5 (xHigh)',
            creator: 'Anthropic',
            index: 48,
          },
        ],
        arena: boards([
          { name: 'Grok 4.6 (xHigh)', org: 'xai', score: 1400 },
          { name: 'Claude Sonnet 5 (Max)', org: 'anthropic', score: 1450 },
        ]),
        livebench: [],
        modelsdev: [
          { ...qwen('grok-4.6'), provider: 'xai', providerName: 'xAI' },
          { ...qwen('claude-sonnet-5'), provider: 'anthropic', providerName: 'Anthropic' },
        ],
      });
      expect(result.models.map((model) => [model.id, model.sources.aa])).toEqual([
        ['anthropic/claude-sonnet-5', 'claude-sonnet-5'],
        ['xai/grok-4.6', 'grok-4-6-xhigh'],
      ]);
    });
  });
});

describe('reading the payloads', () => {
  it('reads AA models, Arena boards, LiveBench IDs and models.dev prices', () => {
    expect(
      aaEntries([
        {
          slug: 'a',
          name: 'A (Max)',
          model_creator: { id: 'x', name: 'Acme' },
          evaluations: { artificial_analysis_intelligence_index: 50 },
        },
        { name: 'no slug' },
      ]),
    ).toEqual([{ slug: 'a', name: 'A (Max)', creator: 'Acme', index: 50 }]);

    const boards = arenaEntries({
      arena_text: [
        { model_name: 'A', organization: 'acme', rating: 1400, category: 'overall' },
        { model_name: 'A', organization: 'acme', rating: 1500, category: 'coding' },
      ],
      arena_agent: [{ model_name: 'A', organization: 'acme', score: 0.1, category: 'overall' }],
    });
    expect(boards.arena_text).toEqual([{ name: 'A', org: 'acme', score: 1400 }]);
    expect(boards.arena_webdev).toEqual([]);
    expect(boards.arena_agent).toEqual([{ name: 'A', org: 'acme', score: 0.1 }]);

    expect(livebenchIds({ table: 'model,a,b\nx,1,2\n\ny,3,4\n' })).toEqual(['x', 'y']);

    expect(
      modelsdevEntries({
        acme: {
          name: 'Acme',
          models: {
            a: { name: 'A', release_date: '2026-01-01', cost: { input: 1, output: 2 } },
            b: { name: 'B', cost: { input: 1 } },
          },
        },
      }),
    ).toEqual([
      {
        provider: 'acme',
        providerName: 'Acme',
        id: 'a',
        name: 'A',
        priced: true,
        release: '2026-01-01',
      },
      { provider: 'acme', providerName: 'Acme', id: 'b', name: 'B', priced: false, release: null },
    ]);
  });
});

describe('compareWithList', () => {
  it('lists added and dropped models and every field that differs', () => {
    const file = (id: string, sources: Record<string, string>): ModelEntry => ({
      id,
      data: { name: 'A', vendor: 'Acme', status: 'active', sources, overrides: {} },
    });
    const found = discoverModels({
      aa: [{ slug: 'a', name: 'A', creator: 'Acme', index: 50 }],
      arena: {
        arena_text: [{ name: 'A (Max)', org: 'acme', score: 1 }],
        arena_webdev: [],
        arena_agent: [],
      },
      livebench: [],
      modelsdev: [
        { provider: 'acme', providerName: 'Acme', id: 'a', name: 'A', priced: true, release: null },
      ],
    }).models;
    expect(
      compareWithList(found, [
        file('acme/a', { aa: 'a', arena_text: 'A (High)' }),
        file('acme/gone', {}),
      ]),
    ).toEqual({
      added: [],
      dropped: ['acme/gone'],
      changed: [{ id: 'acme/a', field: 'arena_text', file: 'A (High)', found: 'A (Max)' }],
    });
  });
});
