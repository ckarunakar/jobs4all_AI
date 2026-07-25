import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RECOMMEND_THRESHOLD } from "@/lib/careerOps/scoreUtils";

const BANDS = [
  { label: "Excellent fit", range: "4.5–5.0", token: "excellent" },
  { label: "Strong fit", range: "4.0–4.49", token: "recommended" },
  { label: "Good fit", range: "3.5–3.99", token: "caution" },
  { label: "Possible fit", range: "3.0–3.49", token: "caution" },
  { label: "Weak / Not recommended", range: "< 3.0", token: "low" },
];

/** Explains how the single Career-Ops fit score is interpreted. */
export function FitScoreCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-accent" />
          Career-Ops Fit Score
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted">
          Every job gets a single score from 1.0 to 5.0, blended from CV match,
          alignment, compensation, culture, and red flags. The recommended apply
          threshold is{" "}
          <span className="font-semibold text-foreground">
            {RECOMMEND_THRESHOLD.toFixed(1)}/5
          </span>
          .
        </p>
        <div className="space-y-1.5">
          {BANDS.map((b) => (
            <div
              key={b.label}
              className="flex items-center justify-between text-sm"
            >
              <span className="flex items-center gap-2">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: `var(--${b.token})` }}
                />
                {b.label}
              </span>
              <span className="font-mono text-xs text-muted">{b.range}</span>
            </div>
          ))}
        </div>
        <p className="rounded-md border border-border bg-surface p-3 text-xs text-muted-foreground">
          Lower-fit jobs aren&apos;t hidden — they&apos;re deprioritized so you
          spend time where it counts.
        </p>
      </CardContent>
    </Card>
  );
}
