import { describe, expect, it } from 'vitest';
import { chartImageName } from '@/lib/chart-image';
import { SITE_URL } from '@/lib/dataset';
import { SITE_HOST } from '@/lib/share';

const DAY = new Date(2026, 10, 2);

describe('exported chart file names', () => {
  it('joins the parts and the local date', () => {
    expect(chartImageName(['bar', 'cost'], DAY)).toBe('mekiki-bar-cost-2026-11-02.png');
  });

  it('keeps a model ID readable and safe as a file name', () => {
    expect(chartImageName(['openai/gpt-6.1-sol intelligence'], DAY)).toBe(
      'mekiki-openai-gpt-6.1-sol-intelligence-2026-11-02.png',
    );
    expect(chartImageName(['../a\\b:c?', '.hidden.'], DAY)).toBe(
      'mekiki-a-b-c-hidden-2026-11-02.png',
    );
  });

  it('drops parts with nothing left in them', () => {
    expect(chartImageName(['', '智能', '///'], DAY)).toBe('mekiki-2026-11-02.png');
  });
});

describe('the watermark', () => {
  it('names the host the site is served from', () => {
    expect(SITE_HOST).toBe(new URL(SITE_URL).host);
  });
});
