import { parse } from '@astrojs/compiler-rs';
import ts from 'typescript';

export type CommentSyntax = 'script' | 'css' | 'html';

export interface CommentSpan {
  start: number;
  end: number;
  syntax: CommentSyntax;
}

const SCRIPT_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

export const CHECKED_EXTENSIONS = [...SCRIPT_EXTENSIONS, '.astro', '.css'];

const BIOME_SUPPRESSION = 'biome-ignore(?:-all|-start|-end)?\\s';

const DIRECTIVES: Record<CommentSyntax, RegExp> = {
  script: new RegExp(
    [
      '^\\/\\/\\/\\s*<reference\\s',
      `^\\/(?:\\/|\\*\\*?)\\s*(?:@ts-(?:check|nocheck|expect-error|ignore)\\b|${BIOME_SUPPRESSION}|@jsx(?:ImportSource|Runtime|Frag)?\\s)`,
    ].join('|'),
  ),
  css: new RegExp(`^\\/\\*\\s*${BIOME_SUPPRESSION}`),
  html: new RegExp(`^<!--\\s*${BIOME_SUPPRESSION}`),
};

export function isChecked(file: string): boolean {
  return CHECKED_EXTENSIONS.some((extension) => file.endsWith(extension));
}

export function isDirective(text: string, comment: CommentSpan): boolean {
  return DIRECTIVES[comment.syntax].test(text.slice(comment.start, comment.end));
}

export function findComments(file: string, text: string): CommentSpan[] {
  const spans = file.endsWith('.astro')
    ? astroComments(text)
    : file.endsWith('.css')
      ? cssComments(text, 0, text.length)
      : scriptComments(file, text);
  return spans.sort((a, b) => a.start - b.start);
}

export function findDisallowedComments(file: string, text: string): CommentSpan[] {
  return findComments(file, text).filter((comment) => !isDirective(text, comment));
}

const LINE_BREAKS = new Set(['\r', '\n', String.fromCharCode(0x2028), String.fromCharCode(0x2029)]);

function lineEnd(text: string, from: number): number {
  let index = from;
  while (index < text.length && !LINE_BREAKS.has(text[index])) index += 1;
  return index;
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function scriptComments(file: string, text: string): CommentSpan[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const spans: CommentSpan[] = [];
  let previousEnd = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isJSDoc(node)) return;
    const children = node.getChildren(source);
    if (children.length > 0) {
      for (const child of children) visit(child);
      return;
    }
    if (node.pos === node.end) return;
    const start = node.kind === ts.SyntaxKind.JsxText ? node.pos : node.getStart(source);
    spans.push(...triviaComments(file, text, previousEnd, start));
    previousEnd = node.end;
  };
  visit(source);
  return spans;
}

function triviaComments(file: string, text: string, from: number, to: number): CommentSpan[] {
  const spans: CommentSpan[] = [];
  let index = from === 0 && text.startsWith('#!') ? lineEnd(text, 0) : from;
  while (index < to) {
    if (/\s/.test(text[index])) {
      index += 1;
    } else if (text.startsWith('//', index)) {
      const end = lineEnd(text, index);
      spans.push({ start: index, end, syntax: 'script' });
      index = end;
    } else if (text.startsWith('/*', index)) {
      const close = text.indexOf('*/', index + 2);
      const end = close === -1 ? to : close + 2;
      spans.push({ start: index, end, syntax: 'script' });
      index = end;
    } else {
      throw new Error(`${file}: unexpected text between tokens at offset ${index}`);
    }
  }
  return spans;
}

function stringEnd(text: string, from: number, to: number): number {
  const quote = text[from];
  let index = from + 1;
  while (index < to) {
    const char = text[index];
    if (char === '\\') index += text.startsWith('\r\n', index + 1) ? 3 : 2;
    else if (char === quote) return index + 1;
    else if (char === '\n' || char === '\r' || char === '\f') return index;
    else index += 1;
  }
  return to;
}

function cssComments(text: string, from: number, to: number): CommentSpan[] {
  const spans: CommentSpan[] = [];
  let index = from;
  while (index < to) {
    const char = text[index];
    if (char === '"' || char === "'") {
      index = stringEnd(text, index, to);
    } else if (text.startsWith('/*', index)) {
      const close = text.indexOf('*/', index + 2);
      const end = close === -1 || close + 2 > to ? to : close + 2;
      spans.push({ start: index, end, syntax: 'css' });
      index = end;
    } else if (
      /^url\(/i.test(text.slice(index, index + 4)) &&
      !/[\w-]/.test(text[index - 1] ?? '')
    ) {
      const valueStart = index + 4 + (/^\s*/.exec(text.slice(index + 4))?.[0].length ?? 0);
      if (text[valueStart] === '"' || text[valueStart] === "'") {
        index = valueStart;
      } else {
        const close = text.indexOf(')', valueStart);
        index = close === -1 || close > to ? to : close + 1;
      }
    } else {
      index += 1;
    }
  }
  return spans;
}

interface AstroNode {
  type?: unknown;
  start?: unknown;
  end?: unknown;
  [key: string]: unknown;
}

function isNode(value: unknown): value is AstroNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStyleElement(node: AstroNode): boolean {
  const opening = node.openingElement;
  return (
    node.type === 'JSXElement' &&
    isNode(opening) &&
    isNode(opening.name) &&
    opening.name.name === 'style'
  );
}

function astroComments(text: string): CommentSpan[] {
  const { ast, diagnostics } = parse(text);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (errors.length > 0) throw new Error(errors.map((error) => error.text).join('\n'));

  const spans: CommentSpan[] = [];
  const comments = Array.isArray(ast.comments) ? ast.comments : [];
  for (const comment of comments) {
    if (isNode(comment) && typeof comment.start === 'number' && typeof comment.end === 'number') {
      spans.push({ start: comment.start, end: comment.end, syntax: 'script' });
    }
  }

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isNode(value)) return;
    if (value.type === 'AstroComment' && typeof value.start === 'number') {
      spans.push({ start: value.start, end: Number(value.end), syntax: 'html' });
    }
    if (isStyleElement(value) && Array.isArray(value.children)) {
      for (const child of value.children) {
        if (isNode(child) && typeof child.start === 'number' && typeof child.end === 'number') {
          spans.push(...cssComments(text, child.start, child.end));
        }
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'comments') visit(child);
    }
  };
  visit(ast.body);
  visit(ast.frontmatter);
  return spans;
}
