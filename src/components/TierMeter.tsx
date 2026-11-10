import { cn } from '@/lib/utils';

export type RatingKind = 'intelligence' | 'cost' | 'value';

/** How many of the four pips each tier fills. More pips = more of the thing. */
const LEVEL: Record<string, number> = {
  top: 4,
  high: 3,
  mid: 2,
  low: 1,
  very_high: 4,
};

interface TierMeterProps {
  kind: RatingKind;
  /** Tier key, or null when the model is not rated. */
  tier: string | null;
  /** Localised tier label; when the tier is null, the "not rated" text. */
  label: string;
  /** Figure shown after the label (score or price), already formatted. */
  figure?: string | null;
  /** Put the figure on its own line, for narrow cells. */
  stacked?: boolean;
  className?: string;
}

/**
 * A rating as a four-step grade mark, its label and its figure.
 * Quality ratings are drawn in indigo, cost in vermilion. The pips are
 * decorative: the label carries the same information as text.
 */
export function TierMeter({ kind, tier, label, figure, stacked, className }: TierMeterProps) {
  if (tier === null) {
    return <span className={cn('text-muted-foreground', className)}>{label}</span>;
  }
  const level = LEVEL[tier] ?? 0;
  const fill = kind === 'cost' ? 'bg-expense' : 'bg-quality';
  const mark = (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span aria-hidden="true" className="inline-flex items-end gap-[2px]">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={cn('h-3 w-[5px] rounded-[1px]', step <= level ? fill : 'bg-pip')}
          />
        ))}
      </span>
      <span className="min-w-[2em] font-medium">{label}</span>
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
