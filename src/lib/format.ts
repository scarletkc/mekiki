function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

export function formatPrice(value: number): string {
  if (value === 0) return '$0';
  if (value >= 100) return `$${Math.round(value)}`;
  if (value >= 1) return `$${trimZeros(value.toFixed(2))}`;
  return `$${trimZeros(Number(value.toPrecision(2)).toFixed(6))}`;
}

export function formatScore(value: number): string {
  return value.toFixed(1);
}

export function formatCount(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${trimZeros((value / 1_000_000).toFixed(2))}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

export function formatPercent(value: number): string {
  return `${trimZeros((value * 100).toFixed(1))}%`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
