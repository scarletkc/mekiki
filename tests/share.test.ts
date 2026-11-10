import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareQuery, parseCompareIds } from '@/lib/compare';
import { logoSvg } from '@/lib/logo';
import { COMPARE_MAX } from '@/lib/share';

const KNOWN = ['openai/gpt-6.1-sol', 'google/gemini-3.8-flash', 'xai/grok-4.7', 'a/b', 'c/d'];

describe('compare selection in the address', () => {
  it('is absent when there is no parameter', () => {
    expect(parseCompareIds(null, KNOWN)).toBeNull();
  });

  it('keeps known IDs only, without duplicates, in order', () => {
    expect(parseCompareIds('xai/grok-4.7,nope/x,xai/grok-4.7,openai/gpt-6.1-sol', KNOWN)).toEqual([
      'xai/grok-4.7',
      'openai/gpt-6.1-sol',
    ]);
    expect(parseCompareIds('', KNOWN)).toEqual([]);
  });

  it('stops at the maximum', () => {
    expect(parseCompareIds(KNOWN.join(','), KNOWN)).toHaveLength(COMPARE_MAX);
  });

  it('round-trips through the query string, readable', () => {
    const ids = ['openai/gpt-6.1-sol', 'google/gemini-3.8-flash'];
    const query = compareQuery(ids);
    expect(query).toBe('?m=openai/gpt-6.1-sol,google/gemini-3.8-flash');
    expect(parseCompareIds(new URLSearchParams(query).get('m'), KNOWN)).toEqual(ids);
  });
});

describe('logo file', () => {
  // GitHub cannot render the generated favicon, so the README shows a copy.
  it('matches the mark in src/lib/logo.ts', () => {
    const file = readFileSync('docs/assets/logo.svg', 'utf8').replace(/\r\n/g, '\n');
    expect(file).toBe(logoSvg());
  });
});
