import { Sparkles } from "lucide-react";
import {
  formatScore,
  getScoreColorVar,
  getScoreLabel,
  isRecommended,
  scoreFraction,
} from "@/lib/careerOps/scoreUtils";
import type { CareerOpsScore } from "@/lib/careerOps/types";
import { cn } from "@/lib/utils/cn";

/** Horizontal fit-score meter with the headline number + tier label. */
export function ScoreMeter({
  score,
  className,
}: {
  score: CareerOpsScore;
  className?: string;
}) {
  const color = getScoreColorVar(score);
  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-1.5">
          {isRecommended(score) && (
            <Sparkles className="size-4" style={{ color }} />
          )}
          <span className="text-sm font-medium" style={{ color }}>
            {getScoreLabel(score)}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span
            className="font-mono text-2xl font-semibold leading-none"
            style={{ color }}
          >
            {formatScore(score)}
          </span>
          <span className="text-xs text-muted-foreground">/ 5.0</span>
        </div>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-elevated">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${scoreFraction(score) * 100}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}
