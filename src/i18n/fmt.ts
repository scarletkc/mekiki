/** Fill `{name}` placeholders: `fmt('{n} models', { n: 3 })` → `3 models`. */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
