import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { LegalLinks } from "@/components/legal/LegalLinks";

/** Shared text styles for the legal/support pages. */
export const LEGAL_H2 = "mt-8 text-lg font-semibold tracking-tight";
export const LEGAL_P = "mt-3 text-sm leading-relaxed text-muted";
export const LEGAL_UL =
  "mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted";

/** Public page frame: logo home link, title, content, legal links. */
export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background px-5 py-10">
      <div className="mx-auto max-w-2xl">
        <Link href="/" aria-label="ITJobCafe home" className="inline-block">
          <Logo />
        </Link>
        <h1 className="mt-8 text-3xl font-extrabold tracking-tight">{title}</h1>
        {children}
        <LegalLinks className="mt-12 border-t-2 border-border pt-6" />
      </div>
    </main>
  );
}
