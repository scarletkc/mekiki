import { describe, expect, it } from 'vitest';
import { findDisallowedComments, isChecked } from '../scripts/lib/comments';

function comments(file: string, source: string): string[] {
  return findDisallowedComments(file, source).map((span) => source.slice(span.start, span.end));
}

describe('findDisallowedComments in TypeScript and JavaScript', () => {
  it('finds line, block, doc and trailing comments', () => {
    const source = [
      '/** Doc. */',
      'export const a = 1; // trailing',
      '/* block */',
      'function f(/* inline */ x: number) {',
      '  // inside',
      '  return x;',
      '}',
      '// last',
    ].join('\n');
    expect(comments('a.ts', source)).toEqual([
      '/** Doc. */',
      '// trailing',
      '/* block */',
      '/* inline */',
      '// inside',
      '// last',
    ]);
  });

  it('ignores slashes in strings, templates, regular expressions and division', () => {
    const source = [
      "const url = 'https://example.com/*path*/';",
      'const doubled = "//";',
      `const template = \`http://x/\${url}//y/*z*/\`;`,
      'const pattern = /\\/\\/.*\\/\\*/g;',
      'const ratio = 4 / 2 / 1;',
    ].join('\n');
    expect(comments('a.mjs', source)).toEqual([]);
  });

  it('ignores slashes in JSX text and attributes but finds JSX comments', () => {
    const source = [
      'export const A = () => (',
      '  <a href="https://example.com">',
      '    http://example.com // not a comment /* nor this */',
      '    {/* a comment */}',
      '  </a>',
      ');',
    ].join('\n');
    expect(comments('a.tsx', source)).toEqual(['/* a comment */']);
  });

  it('allows tool directives only at the start of a comment', () => {
    const source = [
      '// @ts-check',
      '/// <reference types="vite/client" />',
      '/** @jsxImportSource react */',
      '// @ts-expect-error the fixture is wrong on purpose',
      '// @ts-ignore',
      '// biome-ignore lint/style/useConst: reassigned below',
      'let a = 1;',
      '// note: @ts-ignore',
      '// @ts-checked',
    ].join('\n');
    expect(comments('a.ts', source)).toEqual(['// note: @ts-ignore', '// @ts-checked']);
  });
});

describe('findDisallowedComments in CSS', () => {
  it('finds comments outside strings and URLs', () => {
    const source = [
      '/* top */',
      "a::before { content: '/* not */'; background: url(http://x/*y); }",
      'b { color: red; /* inner */ }',
      '/* biome-ignore lint/complexity/noImportantStyles: needed */',
    ].join('\n');
    expect(comments('a.css', source)).toEqual(['/* top */', '/* inner */']);
  });

  it('keeps a string open across an escaped line break', () => {
    for (const lineBreak of ['\n', '\r\n']) {
      const source = `a { content: 'x\\${lineBreak}/* not */'; } /* real */`;
      expect(comments('a.css', source)).toEqual(['/* real */']);
    }
  });
});

describe('findDisallowedComments in Astro', () => {
  it('finds comments in the frontmatter, template, scripts and styles', () => {
    const source = [
      '---',
      '// frontmatter',
      "const url = 'https://example.com';",
      '---',
      '<!-- markup -->',
      '<a href="https://example.com" data-x={url /* attribute */}>http://x // text</a>',
      '{/* expression */}',
      '<script is:inline>',
      '  // script',
      '  const s = "//not";',
      '</script>',
      "<style>a { content: '/* not */'; } /* style */</style>",
    ].join('\n');
    expect(comments('a.astro', source)).toEqual([
      '// frontmatter',
      '<!-- markup -->',
      '/* attribute */',
      '/* expression */',
      '// script',
      '/* style */',
    ]);
  });

  it('finds comments in scripts, styles and markup nested in an expression', () => {
    const source = [
      '---',
      'const a = 1;',
      '---',
      '{a && (',
      '  <section>',
      '    <script is:inline define:vars={{ a }}>',
      '      // script',
      '      var b = "//not";',
      '    </script>',
      '    <style>/* style */</style>',
      '    <!-- markup -->',
      '  </section>',
      ')}',
    ].join('\n');
    expect(comments('a.astro', source)).toEqual(['// script', '/* style */', '<!-- markup -->']);
  });

  it('counts offsets in UTF-16 code units', () => {
    const source = ['---', "const t = '中文 — 文本';", '// 注释', '---', '<p>中文</p>'].join('\n');
    expect(comments('a.astro', source)).toEqual(['// 注释']);
  });
});

describe('isChecked', () => {
  it('covers code files only', () => {
    expect(['a.ts', 'a.tsx', 'a.mjs', 'a.cjs', 'a.js', 'a.astro', 'a.css'].every(isChecked)).toBe(
      true,
    );
    expect(['a.md', 'a.json', 'a.yml', 'a.yaml', '.env.example'].some(isChecked)).toBe(false);
  });
});
