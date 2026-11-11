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
  /** A second, smaller line under the mark, such as the price behind a score. */
  note?: string;
  /** Longer explanation of the note, shown on hover. */
  noteTitle?: string;
  className?: string;
}

/**
 * A rating as a five-step grade mark, its label and its figure.
 * Quality ratings are drawn in indigo, cost in vermilion. The pips are
 * decorative: the label carries the same information as text.
 */
export function TierMeter({
  kind,
  tier,
  label,
  figure,
  stacked,
  note,
  noteTitle,
  className,
}: TierMeterProps) {
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
  const noteLine = note != null && (
    <span
      // Not `.num`, which never wraps: in a narrow card the note may need two lines.
      className={cn('text-muted-foreground text-xs tabular-nums', !stacked && 'whitespace-nowrap')}
      title={noteTitle}
    >
      {note}
    </span>
  );
  if (stacked) {
    return (
      <span className={cn('inline-flex flex-col gap-0.5', className)}>
        {mark}
        {figure != null && <span className="num text-muted-foreground text-xs">{figure}</span>}
        {noteLine}
      </span>
    );
  }
  const line = (
    <span
      className={cn('inline-flex items-center gap-2 whitespace-nowrap', !noteLine && className)}
    >
      {mark}
      {figure != null && <span className="num text-muted-foreground">{figure}</span>}
    </span>
  );
  if (!noteLine) return line;
  return (
    <span className={cn('inline-flex flex-col gap-0.5', className)}>
      {line}
      {noteLine}
    </span>
  );
}
