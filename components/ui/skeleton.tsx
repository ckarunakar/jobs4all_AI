import { cn } from "@/lib/utils/cn";

/** Shimmering placeholder block (see .skeleton in globals.css). */
function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} />;
}

export { Skeleton };
