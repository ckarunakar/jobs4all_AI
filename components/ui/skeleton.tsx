import { cn } from "@/lib/utils/cn";

/** Shimmering placeholder block (see .skeleton in globals.css): a pulsing block on the --border token. */
function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} />;
}

export { Skeleton };
