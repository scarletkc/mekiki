import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { findDisallowedComments, isChecked } from './lib/comments';

function trackedFiles(): string[] {
  const output = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      encoding: 'utf8',
    },
  );
  return output.split('\0').filter((file) => file !== '' && existsSync(file));
}

function position(text: string, offset: number): string {
  const lines = text.slice(0, offset).split('\n');
  return `${lines.length}:${lines[lines.length - 1].length + 1}`;
}

function preview(text: string, start: number, end: number): string {
  const firstLine = text.slice(start, end).split(/\r?\n/)[0].trim();
  return firstLine.length > 72 ? `${firstLine.slice(0, 71)}…` : firstLine;
}

const args = process.argv.slice(2);
const files = (args.length > 0 ? args : trackedFiles()).filter(isChecked).sort();

let found = 0;
let failed = false;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  try {
    for (const comment of findDisallowedComments(file, text)) {
      console.error(
        `${file}:${position(text, comment.start)}  ${preview(text, comment.start, comment.end)}`,
      );
      found += 1;
    }
  } catch (error) {
    console.error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    failed = true;
  }
}

if (found > 0) {
  console.error(
    `\n${found} comment${found === 1 ? '' : 's'} found. Code carries no comments, only tool directives (docs/development.md).`,
  );
}
if (found > 0 || failed) process.exit(1);
console.log(`No comments in ${files.length} files.`);
