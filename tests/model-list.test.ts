import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  mergeModelList,
  overridesSchema,
  readModelList,
  serializeModelList,
  supersededIds,
  versionOf,
  waitingOverrides,
  type GeneratedModel,
} from '@/lib/model-list';

const model = (id: string, name: string, vendor = 'Acme', sources = {}): GeneratedModel => ({
  id,
  name,
  vendor,
  sources: { modelsdev: id, ...sources },
});

describe('versionOf', () => {
  it('splits a name into its family and its version', () => {
    expect(versionOf('Claude Opus 5.5')).toEqual({ family: 'claude opus', version: [5, 5] });
    expect(versionOf('GPT-6.1 Sol')).toEqual({ family: 'gpt sol', version: [6, 1] });
    expect(versionOf('Kimi K3.1 Pro')).toEqual({ family: 'kimi k pro', version: [3, 1] });
    expect(versionOf('Gemini 3.1 Flash Lite Preview')).toEqual({
      family: 'gemini flash lite',
      version: [3, 1],
    });
    expect(versionOf('Muse Spark')).toEqual({ family: 'muse spark', version: null });
  });
});

describe('supersededIds', () => {
  it('marks older versions of the same family and vendor', () => {
    const ids = supersededIds([
      model('a/opus-5', 'Claude Opus 5'),
      model('a/opus-5-5', 'Claude Opus 5.5'),
      model('a/opus-4-10', 'Claude Opus 4.10'),
      model('a/sonnet-5', 'Claude Sonnet 5'),
      model('b/opus-6', 'Claude Opus 6', 'Other vendor'),
      model('a/flash-lite', 'Gemini 3.1 Flash Lite Preview'),
      model('a/flash-lite-2', 'Gemini 3.5 Flash Lite'),
      model('a/flash', 'Gemini 3.8 Flash'),
    ]);
    expect([...ids].sort()).toEqual(['a/flash-lite', 'a/opus-4-10', 'a/opus-5']);
  });
});

describe('mergeModelList', () => {
  const generated = [
    model('a/one', 'One 1', 'Acme', { aa: 'one', arena_text: 'One (Max)' }),
    model('a/one-2', 'One 2', 'Acme', { aa: 'one-2' }),
    model('a/two', 'Two', 'Acme', { aa: 'two' }),
  ];

  it('lists the generated models and marks superseded ones legacy', () => {
    const list = mergeModelList(generated);
    expect(list.map((entry) => [entry.id, entry.data.status])).toEqual([
      ['a/one', 'legacy'],
      ['a/one-2', 'active'],
      ['a/two', 'active'],
    ]);
    expect(list[0]?.data.sources).toEqual({
      modelsdev: 'a/one',
      aa: 'one',
      arena_text: 'One (Max)',
    });
  });

  it('applies exclusions, replaced fields, cleared mappings, statuses and prices', () => {
    const list = mergeModelList(
      generated,
      overridesSchema.parse({
        exclude: ['a/two'],
        models: {
          'a/one': {
            name: 'One',
            status: 'active',
            sources: { arena_text: null, livebench: 'one' },
          },
          'a/one-2': { price: { input: 1, output: 2 } },
        },
      }),
    );
    expect(list.map((entry) => entry.id)).toEqual(['a/one', 'a/one-2']);
    expect(list[0]?.data).toMatchObject({
      name: 'One',
      status: 'active',
      sources: { modelsdev: 'a/one', aa: 'one', livebench: 'one' },
    });
    expect(list[0]?.data.sources.arena_text).toBeUndefined();
    expect(list[1]?.data.overrides.price).toEqual({ input: 1, output: 2 });
  });

  it('adds a model by hand, and keeps other corrections until their model is listed', () => {
    const overrides = overridesSchema.parse({
      models: {
        'b/new': { name: 'New', vendor: 'Beta', sources: { aa: 'new' } },
        'b/later': { status: 'legacy' },
      },
    });
    const list = mergeModelList(generated, overrides);
    expect(list.map((entry) => entry.id)).toContain('b/new');
    expect(list.map((entry) => entry.id)).not.toContain('b/later');
    expect(waitingOverrides(generated, overrides)).toEqual(['b/later']);
  });

  it('refuses an overrides file with unknown fields', () => {
    expect(() => overridesSchema.parse({ models: { 'a/one': { score: 90 } } })).toThrow();
    expect(() => overridesSchema.parse({ include: [] })).toThrow();
  });
});

describe('the model list files', () => {
  it('are valid and written sorted', () => {
    const list = readModelList();
    expect(list.length).toBeGreaterThan(0);
    expect(new Set(list.map((entry) => entry.id)).size).toBe(list.length);
    const text = readFileSync('data/models.json', 'utf8').replace(/\r\n/g, '\n');
    const { models } = JSON.parse(text) as { models: GeneratedModel[] };
    expect(serializeModelList(models)).toBe(text);
    expect(() =>
      overridesSchema.parse(parseYaml(readFileSync('data/model-overrides.yaml', 'utf8'))),
    ).not.toThrow();
  });
});
