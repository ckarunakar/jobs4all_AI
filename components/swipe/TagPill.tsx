import { cn } from "@/lib/utils/cn";

type TagTone = "default" | "primary" | "muted";

const TONES: Record<TagTone, string> = {
  default: "border-border bg-elevated text-muted",
  primary: "border-primary/30 bg-primary-soft text-accent",
  muted: "border-border bg-transparent text-muted-foreground",
};

/** Small skill / tech-stack chip. */
export function TagPill({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: TagTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
