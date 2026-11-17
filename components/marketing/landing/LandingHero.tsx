import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Eyebrow, GradientText } from "@/components/marketing/primitives";
import { MatchIllustration } from "./MatchIllustration";

const CHECKS = [
  "Personalized job scores",
  "Skills gap insights",
  "You choose when to apply",
];

/** Landing hero: headline and calls to action left, match illustration right. */
export function LandingHero() {
  return (
    <section className="relative overflow-hidden bg-wash">
      {/* Faint decoration: lavender ring, pink blob, blue glow. Below 640px the
          blob would sit behind the gradient headline and dull its pink end. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[150px] top-[300px] size-[440px] rounded-full border-[60px] border-[rgba(221,214,254,0.32)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[6%] top-10 hidden size-[170px] rotate-[18deg] rounded-[42%] bg-[rgba(244,212,228,0.65)] sm:block"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -right-[120px] size-[420px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(191,219,254,0.55), rgba(191,219,254,0) 70%)",
        }}
      />

      <div className="relative mx-auto flex max-w-[1240px] flex-wrap items-center gap-14 px-5 pb-14 pt-10 sm:px-8 sm:pb-[84px] sm:pt-[60px]">
        <div className="min-w-0 flex-[1_1_480px]">
          <Eyebrow>
            <span aria-hidden="true">✦</span> AI-POWERED CAREER MATCHING
          </Eyebrow>
          {/* `!`: globals.css sets h1 letter-spacing outside any layer, which beats utilities. */}
          <h1 className="mt-6 text-[clamp(42px,5.4vw,78px)] font-extrabold leading-[1.02] tracking-[-0.035em]! text-foreground">
            <span className="block">Know Your Job</span>{" "}
            <span className="block">
              <GradientText>Matching Score.</GradientText>
            </span>{" "}
            <span className="block">Find Your Fit.</span>
          </h1>
          <p className="mt-[26px] max-w-[580px] text-[19px] leading-[1.6] text-muted">
            Upload your résumé once. Discover your{" "}
            <strong className="font-bold text-foreground">best-fit tech jobs</strong>,
            see why each role fits, and build your career with confidence.
          </p>

          <div className="mt-[34px] flex flex-wrap gap-4">
            <Link href="/swipe" className={buttonVariants({ size: "lg" })}>
              Find My Matches
              <ArrowUpRight aria-hidden="true" />
            </Link>
            <Link
              href="/profile"
              className={buttonVariants({ variant: "secondary", size: "lg" })}
            >
              Set Up Profile
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>

          <ul className="mt-[22px] flex flex-wrap gap-x-[22px] gap-y-2 text-sm font-semibold text-muted">
            {CHECKS.map((item) => (
              <li key={item} className="inline-flex items-center gap-1.5">
                <Check
                  aria-hidden="true"
                  strokeWidth={3}
                  className="size-[15px] text-excellent-text"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="mx-auto min-w-0 max-w-[560px] flex-[1_1_460px]">
          <MatchIllustration />
        </div>
      </div>
    </section>
  );
}
