import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import {
  formatScore,
  getScoreTier,
  isRecommended,
} from "@/lib/careerOps/scoreUtils";
import type { CareerOpsScore } from "@/lib/careerOps/types";

interface ScoreBadgeProps {
  score: CareerOpsScore;
  /** Show the tier label (e.g. "Recommended") next to the number. */
  showLabel?: boolean;
  className?: string;
}

/** Compact "X.X / 5.0" pill colored by Career-Ops fit tier. */
export function ScoreBadge({ score, showLabel, className }: ScoreBadgeProps) {
  const tier = getScoreTier(score);
  return (
    <Badge variant={tier.token} className={cn("font-mono", className)}>
      {isRecommended(score) && <Sparkles className="size-3" />}
      {formatScore(score)}
      <span className="text-[10px] opacity-60">/ 5.0</span>
      {showLabel && (
        <span className="font-sans font-medium">· {tier.label}</span>
      )}
    </Badge>
  );
}
