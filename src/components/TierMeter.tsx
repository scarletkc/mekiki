import { cn } from '@/lib/utils';

export type RatingKind = 'intelligence' | 'cost' | 'value';

/** How many of the five pips each tier fills. More pips = more of the thing. */
const TIER_LEVEL: Record<string, number> = {
  top: 5,
  very_high: 5,
  high: 4,
  mid: 3,
  low: 2,
  very_low: 1,
};

/** Number of pips in a tier mark. */
const TIER_STEPS = 5;

interface TierMeterProps {
  kind: RatingKind;
  /** Tier key, or null when the model is not rated. */
  tier: string | null;
  /** Localised tier label; when the tier is null, the "not rated" text. */
  label: string;
  /** Figure shown after the label (score or price), already formatted. */
  figure?: string | null;
  /**
   * Put the figure on its own line, for narrow cells. The label also drops
   * below the pips when the cell is too narrow for both ("Very low" on a
   * 320px phone).
   */
  stacked?: boolean;
  className?: string;
}

/**
 * A rating as a five-step grade mark, its label and its figure.
 * Quality ratings are drawn in indigo, cost in vermilion. The pips are
 * decorative: the label carries the same information as text.
 */
export function TierMeter({ kind, tier, label, figure, stacked, className }: TierMeterProps) {
  if (tier === null) {
    return <span className={cn('text-muted-foreground', className)}>{label}</span>;
  }
  const level = TIER_LEVEL[tier] ?? 0;
  const fill = kind === 'cost' ? 'bg-expense' : 'bg-quality';
  const mark = (
    <span
      className={cn(
        'inline-flex items-center',
        stacked ? 'flex-wrap gap-x-2 gap-y-0.5' : 'gap-2 whitespace-nowrap',
      )}
    >
      <span aria-hidden="true" className="inline-flex items-end gap-[2px]">
        {Array.from({ length: TIER_STEPS }, (_, index) => index + 1).map((step) => (
          <span
            key={step}
            className={cn('h-3 w-[5px] rounded-[1px]', step <= level ? fill : 'bg-pip')}
          />
        ))}
      </span>
      <span className="min-w-[2em] font-medium whitespace-nowrap">{label}</span>
    </span>
  );
  if (stacked) {
    return (
      <span className={cn('inline-flex flex-col gap-0.5', className)}>
        {mark}
        {figure != null && <span className="num text-muted-foreground text-xs">{figure}</span>}
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-2 whitespace-nowrap', className)}>
      {mark}
      {figure != null && <span className="num text-muted-foreground">{figure}</span>}
    </span>
  );
}
