/**
 * Share images (Open Graph cards), rendered to PNG at build time.
 *
 * satori lays out the card and turns its text into paths; resvg rasterises
 * the result. Both run offline, with the font read from node_modules. The
 * cards are in English for every locale: model names are Latin script, and
 * a CJK font would add megabytes to the build for three short labels.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import type { ReactNode } from 'react';
import satori from 'satori';
import { en as t } from '../i18n/en';
import type { ModelRecord } from './dataset';
import { formatPrice, formatScore } from './format';
import { BRAND, LOGO_EYE, LOGO_RADIUS, LOGO_VIEWBOX } from './logo';
import { OG_HEIGHT, OG_WIDTH } from './share';

const HOST = 'mekiki.fog.moe';

/** How many of the five pips each tier fills; mirrors src/components/TierMeter.tsx. */
const LEVEL: Record<string, number> = {
  top: 5,
  very_high: 5,
  high: 4,
  mid: 3,
  low: 2,
  very_low: 1,
};
const STEPS = [1, 2, 3, 4, 5];

let fonts: { name: string; data: Buffer; weight: 400 | 600; style: 'normal' }[] | undefined;

function loadFonts() {
  // satori reads WOFF but not WOFF2 or variable fonts, hence the static
  // @fontsource package next to the variable one the site uses.
  const file = (weight: number) =>
    join(
      process.cwd(),
      'node_modules/@fontsource/instrument-sans/files',
      `instrument-sans-latin-${weight}-normal.woff`,
    );
  fonts ??= [
    { name: 'Instrument Sans', data: readFileSync(file(400)), weight: 400, style: 'normal' },
    { name: 'Instrument Sans', data: readFileSync(file(600)), weight: 600, style: 'normal' },
  ];
  return fonts;
}

async function toPng(card: ReactNode): Promise<Uint8Array<ArrayBuffer>> {
  const svg = await satori(card, { width: OG_WIDTH, height: OG_HEIGHT, fonts: loadFonts() });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
  return new Uint8Array(png);
}

function Logo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox={LOGO_VIEWBOX}>
      <title>mekiki</title>
      <rect width="32" height="32" rx={LOGO_RADIUS} fill={BRAND.seal} />
      <path d={LOGO_EYE} fill={BRAND.paper} fillRule="evenodd" />
    </svg>
  );
}

/** Five pips take about the width four did, so a long label and price still fit. */
function Pips({ level, color, scale = 1 }: { level: number; color: string; scale?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 * scale }}>
      {STEPS.map((step) => (
        <div
          key={step}
          style={{
            width: 11 * scale,
            height: 34 * scale,
            borderRadius: 3 * scale,
            backgroundColor: step <= level ? color : BRAND.pip,
          }}
        />
      ))}
    </div>
  );
}

interface Rating {
  label: string;
  tier: string | null;
  tierLabel: string;
  figure: string | null;
  color: string;
  note?: string;
}

/**
 * Type sizes for the tier label and figure. A long label ("Very high") with a
 * price must still fit one third of the card, and "Very low" with a
 * three-decimal price ("$0.077") is the longest pair, so it steps down again.
 */
function ratingSizes({ tierLabel, figure }: Rating) {
  if (tierLabel.length <= 5) return { label: 40, figure: 34, gap: 16 };
  if (tierLabel.length + (figure?.length ?? 0) <= 13) return { label: 34, figure: 30, gap: 16 };
  return { label: 32, figure: 27, gap: 12 };
}

function RatingBlock({ rating, first }: { rating: Rating; first: boolean }) {
  const sizes = ratingSizes(rating);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        gap: 14,
        paddingLeft: first ? 0 : 36,
        borderLeft: first ? 'none' : `2px solid ${BRAND.border}`,
      }}
    >
      <div style={{ fontSize: 26, color: BRAND.muted }}>{rating.label}</div>
      {rating.tier === null ? (
        <div
          style={{
            display: 'flex',
            height: 48,
            alignItems: 'center',
            fontSize: 36,
            color: BRAND.muted,
          }}
        >
          {rating.tierLabel}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: sizes.gap, height: 48 }}>
          <Pips level={LEVEL[rating.tier] ?? 0} color={rating.color} />
          <div
            style={{
              fontSize: sizes.label,
              fontWeight: 600,
              color: BRAND.foreground,
              whiteSpace: 'nowrap',
            }}
          >
            {rating.tierLabel}
          </div>
          {rating.figure !== null && (
            <div
              style={{
                fontSize: sizes.figure,
                color: BRAND.muted,
                whiteSpace: 'nowrap',
              }}
            >
              {rating.figure}
            </div>
          )}
        </div>
      )}
      {rating.note && <div style={{ fontSize: 20, color: BRAND.muted }}>{rating.note}</div>}
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: BRAND.background,
        fontFamily: 'Instrument Sans',
        color: BRAND.foreground,
      }}
    >
      <div style={{ height: 10, backgroundColor: BRAND.seal }} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '52px 72px 60px' }}>
        {children}
      </div>
    </div>
  );
}

function Masthead() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Logo size={48} />
        <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: -0.5 }}>mekiki</div>
      </div>
      <div style={{ fontSize: 26, color: BRAND.muted }}>{HOST}</div>
    </div>
  );
}

/** Font size that keeps a long model name on one line. */
function nameSize(name: string): number {
  if (name.length <= 16) return 92;
  if (name.length <= 22) return 80;
  if (name.length <= 28) return 66;
  return 54;
}

/** The share card of one model. */
export function modelCard(model: ModelRecord): Promise<Uint8Array<ArrayBuffer>> {
  const { intelligence, cost, value } = model.rating;
  const ratings: Rating[] = [
    {
      label: t.rating.intelligence,
      tier: intelligence.tier,
      tierLabel: intelligence.tier ? t.tier.intelligence[intelligence.tier] : t.empty.unrated,
      figure: intelligence.score === null ? null : formatScore(intelligence.score),
      color: BRAND.ink,
    },
    {
      label: t.rating.cost,
      tier: cost.tier,
      tierLabel: cost.tier ? t.tier.cost[cost.tier] : t.empty.noPrice,
      figure: cost.free ? t.empty.free : cost.blended === null ? null : formatPrice(cost.blended),
      color: BRAND.seal,
      note: cost.blended === null || cost.free ? undefined : t.detail.blendedUnit,
    },
    {
      label: t.rating.value,
      tier: value.tier,
      tierLabel: value.tier ? t.tier.value[value.tier] : t.empty.unrated,
      figure: value.score === null ? null : formatScore(value.score),
      color: BRAND.ink,
    },
  ];
  const badges = [
    model.status === 'legacy' ? t.badge.legacy : null,
    model.facts.open_weights === true ? t.badge.openWeights : null,
  ].filter((badge) => badge !== null);

  return toPng(
    <Frame>
      <Masthead />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 'auto',
          marginBottom: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            fontSize: 30,
            color: BRAND.muted,
          }}
        >
          <div>{model.vendor}</div>
          {badges.map((badge) => (
            <div
              key={badge}
              style={{
                fontSize: 22,
                padding: '2px 12px',
                border: `2px solid ${BRAND.border}`,
                borderRadius: 8,
              }}
            >
              {badge}
            </div>
          ))}
        </div>
        <div
          style={{
            fontSize: nameSize(model.name),
            fontWeight: 600,
            letterSpacing: -2,
            lineHeight: 1.1,
            marginTop: 6,
          }}
        >
          {model.name}
        </div>
      </div>
      <div style={{ display: 'flex' }}>
        {ratings.map((rating, index) => (
          <RatingBlock key={rating.label} rating={rating} first={index === 0} />
        ))}
      </div>
    </Frame>,
  );
}

/** The share card of every other page. */
export function siteCard(): Promise<Uint8Array<ArrayBuffer>> {
  const legend = [
    { label: t.rating.intelligence, level: LEVEL.top, color: BRAND.ink },
    { label: t.rating.cost, level: LEVEL.mid, color: BRAND.seal },
    { label: t.rating.value, level: LEVEL.high, color: BRAND.ink },
  ];
  return toPng(
    <Frame>
      <div
        style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 26, color: BRAND.muted }}
      >
        {HOST}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 'auto',
          marginBottom: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <Logo size={128} />
          <div style={{ fontSize: 124, fontWeight: 600, letterSpacing: -4 }}>mekiki</div>
        </div>
        <div
          style={{
            fontSize: 36,
            color: BRAND.muted,
            marginTop: 28,
            maxWidth: 1056,
            lineHeight: 1.3,
          }}
        >
          {t.meta.description}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 56 }}>
        {legend.map((item) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Pips level={item.level} color={item.color} scale={0.8} />
            <div style={{ fontSize: 30, fontWeight: 600 }}>{item.label}</div>
          </div>
        ))}
      </div>
    </Frame>,
  );
}

/** The mark as a PNG, for the touch icon. */
export function logoPng(size: number, svg: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());
}
