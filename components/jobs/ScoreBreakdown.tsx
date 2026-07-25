import { getScoreTier, scoreFraction } from "@/lib/careerOps/scoreUtils";
import type { CareerOpsScoreBreakdown } from "@/lib/careerOps/types";

/** Renders the Career-Ops per-block sub-scores as labelled bars. */
export function ScoreBreakdown({
  breakdown,
}: {
  breakdown: CareerOpsScoreBreakdown;
}) {
  return (
    <div className="space-y-3.5">
      {breakdown.items.map((item) => {
        const tier = getScoreTier(item.score);
        const color = `var(--${tier.token})`;
        return (
          <div key={item.key}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{item.label}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{Math.round(item.weight * 100)}% weight</span>
                <span className="font-mono text-sm" style={{ color }}>
                  {item.score.toFixed(1)}
                </span>
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-elevated">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${scoreFraction(item.score) * 100}%`,
                  backgroundColor: color,
                }}
              />
            </div>
            {item.note && (
              <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
