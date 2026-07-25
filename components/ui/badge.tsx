import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-border bg-elevated text-muted",
        outline: "border-border-strong text-muted",
        primary: "border-primary/30 bg-primary-soft text-accent",
        excellent:
          "border-[var(--excellent)]/30 bg-[var(--excellent)]/10 text-[var(--excellent)]",
        recommended:
          "border-[var(--recommended)]/30 bg-[var(--recommended)]/10 text-[var(--recommended)]",
        caution:
          "border-[var(--caution)]/30 bg-[var(--caution)]/10 text-[var(--caution)]",
        low: "border-[var(--low)]/30 bg-[var(--low)]/10 text-[var(--low)]",
        danger:
          "border-[var(--danger)]/30 bg-[var(--danger)]/10 text-[var(--danger)]",
        info: "border-[var(--info)]/30 bg-[var(--info)]/10 text-[var(--info)]",
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
