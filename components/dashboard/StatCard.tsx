import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  /** Accent token used for the icon chip. */
  accent?: "primary" | "excellent" | "recommended" | "caution" | "info";
  className?: string;
}

// Solid color-block icon chips for the bold, flat "poster" feel.
const ACCENT_STYLES: Record<NonNullable<StatCardProps["accent"]>, string> = {
  primary: "bg-primary text-white",
  excellent: "bg-[var(--excellent)] text-white",
  recommended: "bg-[var(--recommended)] text-white",
  caution: "bg-[var(--caution)] text-white",
  info: "bg-[var(--info)] text-white",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  accent = "primary",
  className,
}: StatCardProps) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">{label}</p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight tabular-nums">
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-md",
            ACCENT_STYLES[accent],
          )}
        >
          <Icon className="size-5" strokeWidth={2.25} />
        </div>
      </div>
    </Card>
  );
}
