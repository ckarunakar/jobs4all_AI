import { cn } from "@/lib/utils/cn";

/** Small white pill above a page heading, e.g. "✦ AI Tools". */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-card px-[18px] py-[9px] text-xs font-extrabold uppercase tracking-[0.12em] text-eyebrow shadow-white",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Headline-gradient text run. */
export function GradientText({ children }: { children: React.ReactNode }) {
  return <span className="text-gradient">{children}</span>;
}

/** Shorter inner-page hero on the page wash (AI Tools, How It Works, FAQ). */
export function PageHero({
  eyebrow,
  title,
  children,
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className="relative overflow-hidden bg-wash">
      <div
        aria-hidden="true"
        className="absolute right-[8%] hidden sm:block top-[30px] size-[150px] rotate-[18deg] rounded-[42%] bg-[rgba(244,212,228,0.6)]"
      />
      <div
        className={cn(
          "relative mx-auto max-w-[1240px] px-5 pb-12 pt-12 sm:px-8 sm:pb-16 sm:pt-14",
          className,
        )}
      >
        <Eyebrow>
          <span aria-hidden="true">✦</span> {eyebrow}
        </Eyebrow>
        <h1 className="mt-[22px] text-[clamp(38px,4.6vw,64px)] font-extrabold leading-[1.04] tracking-[-0.035em]">
          {title}
        </h1>
        {children ? (
          <p className="mt-5 max-w-[620px] text-[19px] leading-[1.6] text-muted">
            {children}
          </p>
        ) : null}
      </div>
    </section>
  );
}
