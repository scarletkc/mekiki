const EXPORT_IGNORE = 'data-export-ignore';

const EXPORT_SCALE = 2;
const MAX_CANVAS = 16384;

export function chartImageName(parts: string[], date: Date = new Date()): string {
  const slug = parts
    .map((part) =>
      part
        .toLowerCase()
        .replace(/[^a-z0-9.]+/g, '-')
        .replace(/^[-.]+|[-.]+$/g, ''),
    )
    .filter(Boolean);
  const day = [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  return `${['mekiki', ...slug, day].join('-')}.png`;
}

export async function chartImage(node: HTMLElement): Promise<Blob> {
  const { domToBlob } = await import('modern-screenshot');
  return domToBlob(node, {
    type: 'image/png',
    scale: EXPORT_SCALE,
    maximumCanvasSize: MAX_CANVAS,
    backgroundColor: getComputedStyle(node).backgroundColor,
    style: { margin: '0', borderRadius: '0', borderColor: 'transparent' },
    filter: (item) => !(item instanceof Element && item.hasAttribute(EXPORT_IGNORE)),
  });
}

export async function exportChartImage(node: HTMLElement, filename: string): Promise<void> {
  const url = URL.createObjectURL(await chartImage(node));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
