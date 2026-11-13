import { describe, expect, it } from 'vitest';
import { LOCALES, useTranslations } from '@/i18n';
import { alternativeRows, buildAlternatives } from '@/lib/alternatives';
import {
  formatBill,
  formatPriceChange,
  formatSignedBill,
  formatSignedScore,
  switchCost,
} from '@/lib/format';
import type { AlternativesConfig } from '@/lib/scoring.config';
import { getDataset } from '@/lib/site-data';
import { datasetOf, record } from './support/records';

const config: AlternativesConfig = { intelligenceDelta: 3, minSaving: 0.1, monthlySpend: 100 };

const own = record('a/own', { name: 'Own', intelligence: 75, value: 45, price: 3 });

async function pick(others: ReturnType<typeof record>[], model = own) {
  const dataset = await datasetOf([model, ...others]);
  return buildAlternatives(model, dataset, config);
}

describe('alternatives', () => {
  it('suggests the best value among models nearly as smart and cheaper', async () => {
    const result = await pick([
      record('a/dim', { intelligence: 71.9, value: 80, price: 0.1 }),
      record('a/near', { intelligence: 72, value: 60, price: 0.6 }),
      record('a/smart', { intelligence: 85, value: 55, price: 2 }),
      record('a/pricey', { intelligence: 76, value: 70, price: 2.8 }),
    ]);
    expect(result?.options.map((option) => [option.kind, option.model.id])).toEqual([
      ['value', 'a/near'],
    ]);
    expect(result?.options[0]?.ratio).toBeCloseTo(0.2);
  });

  it('leaves out legacy models, unrated models and worse value', async () => {
    const result = await pick([
      record('a/legacy', { intelligence: 80, value: 70, price: 1, status: 'legacy' }),
      record('a/unrated', { intelligence: null, value: null, price: 1 }),
      record('a/unpriced', { intelligence: 80, value: null, price: null }),
      record('a/worse', { intelligence: 74, value: 44, price: 2 }),
    ]);
    expect(result).toBeNull();
  });

  it('breaks a tie on value by price, then by name', async () => {
    const result = await pick([
      record('a/b', { name: 'B', intelligence: 75, value: 60, price: 1 }),
      record('a/a', { name: 'A', intelligence: 75, value: 60, price: 1 }),
      record('a/c', { name: 'C', intelligence: 75, value: 60, price: 2 }),
    ]);
    expect(result?.options[0]?.model.id).toBe('a/a');
  });

  it('adds the cheapest model of the top tier for a model below it', async () => {
    const result = await pick([
      record('a/near', { intelligence: 74, value: 60, price: 1 }),
      record('a/top', { intelligence: 90, value: 40, price: 6 }),
      record('a/top-cheap', { intelligence: 88, value: 42, price: 4.5 }),
    ]);
    expect(result?.options.map((option) => [option.kind, option.model.id])).toEqual([
      ['value', 'a/near'],
      ['top', 'a/top-cheap'],
    ]);
    expect(result?.options[1]?.ratio).toBeCloseTo(1.5);
  });

  it('names a model once when both rules pick it, and skips the top tier for a top model', async () => {
    const both = await pick([record('a/top', { intelligence: 90, value: 70, price: 1 })]);
    expect(both?.options.map((option) => [option.kind, option.model.id])).toEqual([
      ['value', 'a/top'],
    ]);
    const leader = record('a/leader', { intelligence: 95, value: 30, price: 8 });
    expect(await pick([record('a/top', { intelligence: 90, value: 25, price: 9 })], leader)).toBe(
      null,
    );
  });

  it('has nothing to say about a model with no price, a free one or an unrated one', async () => {
    const other = record('a/other', { intelligence: 90, value: 70, price: 1 });
    for (const model of [
      record('a/m', { price: null, value: null }),
      record('a/m', { price: 0, free: true }),
      record('a/m', { intelligence: null, value: null }),
    ]) {
      expect(await pick([other], model)).toBeNull();
    }
  });

  it.each(LOCALES)('puts the model first and writes each change in %s', async (locale) => {
    const t = useTranslations(locale);
    const others = [
      record('a/near', { name: 'Near', intelligence: 73.2, value: 60, price: 0.42 }),
      record('a/top', { name: 'Top', intelligence: 90, value: 40, price: 7.5 }),
    ];
    const result = await pick(others);
    const rows = alternativeRows(own, result!, t, 200);
    expect(rows.map((row) => row.kind)).toEqual(['current', 'value', 'top']);
    expect(rows[0]).toMatchObject({
      label: t.alternatives.current,
      intelligence: '75.0',
      intelligenceChange: null,
      price: '$3',
      priceChange: null,
      monthly: '$200',
      yearly: null,
    });
    expect(rows[1]).toMatchObject({
      label: t.alternatives.value,
      model: { id: 'a/near', name: 'Near' },
      intelligence: '73.2',
      intelligenceChange: '−1.8',
      price: '$0.42',
      priceChange: '−86%',
      monthly: '$28',
    });
    expect(rows[1]!.yearly).toContain('−$2,064');
    expect(rows[2]).toMatchObject({
      label: t.alternatives.top,
      intelligenceChange: '+15.0',
      priceChange: '2.5×',
      monthly: '$500',
    });
    expect(rows[2]!.yearly).toContain('+$3,600');
    for (const row of rows) expect(JSON.stringify(row)).not.toMatch(/[{]\w+[}]|NaN|undefined/);
  });

  it.each(LOCALES)('reads cleanly for every listed model in %s', async (locale) => {
    const t = useTranslations(locale);
    const dataset = await getDataset();
    for (const model of dataset.models) {
      const result = buildAlternatives(model, dataset);
      if (result === null) continue;
      expect(result.options.length, model.id).toBeGreaterThan(0);
      for (const option of result.options) {
        expect(option.model.status, model.id).toBe('active');
        expect(option.model.id).not.toBe(model.id);
      }
      const rows = alternativeRows(model, result, t);
      expect(JSON.stringify(rows), model.id).not.toMatch(/[{]\w+[}]|NaN|undefined/);
    }
  });
});

describe('money and change formats', () => {
  it('writes a bill to the cent below $100 and to the dollar above', () => {
    expect(formatBill(14.063)).toBe('$14.06');
    expect(formatBill(1031.4)).toBe('$1,031');
    expect(formatBill(0)).toBe('$0');
  });

  it('signs a difference with a real minus', () => {
    expect(formatSignedBill(-1031.4)).toBe('−$1,031');
    expect(formatSignedBill(47.5)).toBe('+$47.5');
    expect(formatSignedBill(0)).toBe('$0');
    expect(formatSignedScore(-1.84)).toBe('−1.8');
    expect(formatSignedScore(12)).toBe('+12.0');
    expect(formatSignedScore(0)).toBe('0.0');
  });

  it('writes a price change as a percentage, or as a multiple from double', () => {
    expect(formatPriceChange(0.14)).toBe('−86%');
    expect(formatPriceChange(1.12)).toBe('+12%');
    expect(formatPriceChange(1)).toBe('0%');
    expect(formatPriceChange(2)).toBe('2.0×');
    expect(formatPriceChange(26.3)).toBe('26×');
  });

  it('scales a monthly bill by the price ratio', () => {
    expect(switchCost(100, 0.14)).toEqual({ monthly: '$14', yearly: '−$1,032' });
    expect(switchCost(100, 1.5)).toEqual({ monthly: '$150', yearly: '+$600' });
    expect(switchCost(0, 0.5)).toEqual({ monthly: '$0', yearly: '$0' });
  });
});
