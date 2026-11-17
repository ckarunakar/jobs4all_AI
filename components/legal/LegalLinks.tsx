import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/** Privacy policy + support links (footer, auth pages, settings). */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Legal"
      className={cn(
        "flex items-center justify-center gap-4 text-sm text-muted-foreground",
        className,
      )}
    >
      <Link href="/privacy" className="rounded-sm hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        Privacy policy
      </Link>
      <Link href="/support" className="rounded-sm hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        Support
      </Link>
    </nav>
  );
}
