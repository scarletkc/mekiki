/**
 * The mekiki mark, in one place: the header, the favicon, the touch icon
 * and the share images all draw it from here.
 *
 * A vermilion seal with an eye on it. The eye's pupil is a square cut out
 * of the eye, so the seal shows through it: a discerning eye (目利き) that
 * looks like an appraiser's stamp. Drawn on a 32 × 32 grid.
 */

export const LOGO_VIEWBOX = '0 0 32 32';

/** Corner radius of the seal on the 32 × 32 grid. */
export const LOGO_RADIUS = 7;

/** The eye, with the square pupil as a hole. Fill it with `fill-rule="evenodd"`. */
export const LOGO_EYE =
  'M3.5 16C7.6 9.6 11.6 7 16 7s8.4 2.6 12.5 9c-4.1 6.4-8.1 9-12.5 9S7.6 22.4 3.5 16Z' +
  'M13 11.6h6a1.4 1.4 0 0 1 1.4 1.4v6a1.4 1.4 0 0 1-1.4 1.4h-6a1.4 1.4 0 0 1-1.4-1.4v-6a1.4 1.4 0 0 1 1.4-1.4Z';

/** Fixed colours for places that cannot use the theme's CSS variables. */
export const BRAND = {
  /** The seal: `--expense` in the light theme. */
  seal: '#c03f26',
  /** The eye. */
  paper: '#ffffff',
  /** Quality ratings: `--quality` in the light theme. */
  ink: '#284a8b',
  background: '#f9fafc',
  foreground: '#161d29',
  muted: '#59616d',
  border: '#dce0e5',
  pip: '#d1d6dc',
} as const;

interface LogoSvgOptions {
  /** Rendered size in pixels; omitted for a scalable SVG. */
  size?: number;
  /** Round the corners. Off for the touch icon, which the OS rounds itself. */
  rounded?: boolean;
}

/** The mark as a standalone SVG document. */
export function logoSvg({ size, rounded = true }: LogoSvgOptions = {}): string {
  const dimensions = size ? ` width="${size}" height="${size}"` : '';
  const radius = rounded ? ` rx="${LOGO_RADIUS}"` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}"${dimensions}>` +
    '<title>mekiki</title>' +
    `<rect width="32" height="32"${radius} fill="${BRAND.seal}"/>` +
    `<path d="${LOGO_EYE}" fill="${BRAND.paper}" fill-rule="evenodd"/>` +
    `</svg>\n`
  );
}
