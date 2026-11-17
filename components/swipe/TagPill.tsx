import { cn } from "@/lib/utils/cn";

type TagTone = "default" | "primary" | "muted";

const TONES: Record<TagTone, string> = {
  default: "border-transparent bg-elevated text-muted",
  primary: "border-transparent bg-primary-soft text-primary-soft-foreground",
  muted: "border-border text-muted-foreground",
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
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
