import { Coffee } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** ITJobCafe wordmark + glyph. */
export function Logo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Coffee className="size-[18px]" strokeWidth={2.5} />
      </div>
      {showWordmark && (
        <span className="text-base font-bold tracking-tight">
          ITJob<span className="text-primary">Cafe</span>
        </span>
      )}
    </div>
  );
}
