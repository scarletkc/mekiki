import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useTranslations } from '@/i18n';

describe('project description', () => {
  const sentence = useTranslations('en').meta.description;

  it('is the same in package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { description: string };
    expect(pkg.description).toBe(sentence);
  });

  it('is the README tagline', () => {
    expect(readFileSync('README.md', 'utf8')).toContain(`**${sentence}**`);
  });
});
