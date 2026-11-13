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

export const EXPORT_WIDTH = { chart: 1232, card: 610 };

export async function withOffscreenHost<T>(
  width: number,
  work: (host: HTMLElement) => Promise<T>,
): Promise<T> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.inert = true;
  Object.assign(host.style, {
    position: 'fixed',
    top: '0',
    left: '-100000px',
    width: `${width}px`,
    pointerEvents: 'none',
  });
  document.body.append(host);
  try {
    return await work(host);
  } finally {
    host.remove();
  }
}

export async function settle(): Promise<void> {
  await document.fonts.ready;
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export async function exportClonedChart(
  figure: HTMLElement,
  width: number,
  filename: string,
): Promise<void> {
  await withOffscreenHost(width, async (host) => {
    const copy = figure.cloneNode(true) as HTMLElement;
    host.append(copy);
    await settle();
    await exportChartImage(copy, filename);
  });
}

export function bindExportButton(button: HTMLButtonElement, run: () => Promise<void>): void {
  const status = button.nextElementSibling as HTMLElement | null;
  let timer: number | undefined;

  const show = (state: 'idle' | 'done' | 'failed') => {
    const result = state === 'idle' ? '' : (button.dataset[state] ?? '');
    button.dataset.state = state;
    button.title = result || (button.dataset.label ?? '');
    if (status) status.textContent = result;
  };

  button.addEventListener('click', async () => {
    window.clearTimeout(timer);
    button.disabled = true;
    let state: 'done' | 'failed';
    try {
      await run();
      state = 'done';
    } catch {
      state = 'failed';
    }
    button.disabled = false;
    show(state);
    timer = window.setTimeout(() => show('idle'), 2000);
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
