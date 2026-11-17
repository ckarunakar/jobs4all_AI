import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border border-transparent px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-elevated text-muted",
        outline: "border-border-input bg-card text-muted",
        primary: "bg-panel text-primary-soft-foreground",
        excellent: "bg-[var(--excellent)]/12 text-excellent-text",
        recommended: "bg-[var(--recommended)]/12 text-recommended-text",
        caution: "bg-[var(--caution)]/12 text-caution-text",
        low: "bg-[var(--low)]/12 text-low-text",
        danger: "bg-[var(--danger)]/10 text-danger",
        info: "bg-[var(--info)]/12 text-info-text",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
