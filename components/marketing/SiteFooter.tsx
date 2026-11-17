import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { LegalLinks } from "@/components/legal/LegalLinks";

export function SiteFooter() {
  return (
    <footer className="bg-background">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-3.5 px-5 py-[26px] text-sm text-muted-foreground sm:px-8">
        <Link
          href="/"
          aria-label="ITJobCafé home"
          className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Logo height={34} />
        </Link>
        <span className="font-medium">
          AI-ranked job discovery for tech careers
        </span>
        <LegalLinks className="gap-[18px]" />
      </div>
    </footer>
  );
}
