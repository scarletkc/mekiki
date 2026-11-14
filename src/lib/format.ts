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

export function formatBill(amount: number): string {
  return amount >= 100 ? `$${formatCount(amount)}` : formatPrice(amount);
}

export function formatSignedBill(amount: number): string {
  if (amount === 0) return formatBill(0);
  return `${amount < 0 ? '−' : '+'}${formatBill(Math.abs(amount))}`;
}

export function formatSignedScore(value: number): string {
  if (value === 0) return formatScore(0);
  return `${value < 0 ? '−' : '+'}${formatScore(Math.abs(value))}`;
}

export function formatMultiple(ratio: number): string {
  return ratio >= 10 ? String(Math.round(ratio)) : ratio.toFixed(1);
}

export function formatPriceChange(ratio: number): string {
  if (ratio >= 2) return `${formatMultiple(ratio)}×`;
  const percent = Math.round((ratio - 1) * 100);
  if (percent === 0) return '0%';
  return `${percent < 0 ? '−' : '+'}${Math.abs(percent)}%`;
}

const wholeDollars = (amount: number) => (Math.abs(amount) >= 10 ? Math.round(amount) : amount);

export function switchCost(spend: number, ratio: number): { monthly: string; yearly: string } {
  return {
    monthly: formatBill(wholeDollars(spend * ratio)),
    yearly: formatSignedBill(wholeDollars(spend * (ratio - 1) * 12)),
  };
}

export function formatTokens(value: number): string {
  if (value >= 1e12) return `${trimZeros((value / 1e12).toFixed(2))}T`;
  if (value >= 1e9) return `${trimZeros((value / 1e9).toFixed(2))}B`;
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
