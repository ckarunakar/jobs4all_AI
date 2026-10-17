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
      <Link href="/privacy" className="hover:text-foreground hover:underline">
        Privacy policy
      </Link>
      <Link href="/support" className="hover:text-foreground hover:underline">
        Support
      </Link>
    </nav>
  );
}
