import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { GradientText, PageHero } from "@/components/marketing/primitives";
import { ScoreScale } from "@/components/marketing/ScoreScale";
import { cn } from "@/lib/utils/cn";

export const metadata = { title: "How It Works · ITJobCafé" };

const steps = [
  {
    tile: "linear-gradient(135deg,#3b82f6,#8b5cf6)",
    title: "Upload your résumé",
    body: "Create an account, add a PDF or .docx and fill in your job preferences. That’s your career profile.",
  },
  {
    tile: "linear-gradient(135deg,#5a74e2,#ae4fca)",
    title: "Get your fit scores",
    body: "Ask the AI to score a job, or the next 10 at once. Each gets a 1.0–5.0 score with the reasons behind it.",
  },
  {
    tile: "linear-gradient(135deg,#8b5bd6,#d862a6)",
    title: "Swipe and filter",
    body: "Swipe right on jobs you like, left to skip, or save for later. Filter by skills, city, type and date.",
  },
  {
    tile: "linear-gradient(135deg,#d862a6,#f59e0b)",
    title: "Review and apply",
    body: "Work through the checklist, then apply on the employer’s site when you’re ready. Track every job in Applications.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <section className="bg-wash">
        <PageHero
          eyebrow="HOW IT WORKS"
          title={
            <>
              From résumé to <GradientText>right fit</GradientText>
              <br />
              in four steps.
            </>
          }
        >
          No account needed to start: browse and swipe as a guest. Sign up and
          add your résumé to see your fit scores.
        </PageHero>

        <ol className="mx-auto flex max-w-[1240px] list-none flex-wrap gap-5 px-5 pb-16 pt-4 sm:px-8">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className="min-w-0 flex-[1_1_250px] rounded-[20px] border border-border bg-card/90 p-[26px] shadow-card"
            >
              <div
                aria-hidden="true"
                className="flex size-11 items-center justify-center rounded-full text-[19px] font-extrabold text-white"
                style={{ background: s.tile }}
              >
                {i + 1}
              </div>
              <h2 className="mt-4 text-[21px] font-extrabold">{s.title}</h2>
              <p className="mt-2 text-[15.5px] leading-[1.6] text-muted">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-background">
        <div className="mx-auto max-w-[1000px] px-5 py-[60px] sm:px-8">
          <h2 className="text-center text-[32px] font-extrabold tracking-[-0.02em]">
            Reading your score
          </h2>
          <p className="mx-auto mt-2.5 max-w-[560px] text-center text-[17px] leading-[1.6] text-muted">
            4.0 is where we recommend applying. Below that, read the gaps before
            you spend your time.
          </p>
          <div className="mt-[34px]">
            <ScoreScale />
          </div>
        </div>
      </section>

      <section className="bg-banner">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-6 px-5 py-[52px] text-white sm:px-8">
          <div className="min-w-0 flex-[1_1_380px]">
            <h2 className="text-[32px] font-extrabold tracking-[-0.02em]">
              Ready to find your fit?
            </h2>
            <p className="mt-2 text-[19px] font-bold">
              Start swiping now as a guest. Sign up and add your résumé to see
              your fit scores.
            </p>
          </div>
          <div className="flex flex-wrap gap-3.5">
            <Link
              href="/swipe"
              className={buttonVariants({ variant: "secondary", size: "lg" })}
            >
              Find My Matches ↗
            </Link>
            <Link
              href="/profile"
              className={cn(
                buttonVariants({ variant: "ghost", size: "lg" }),
                "border-[1.5px] border-white/80 font-bold text-white hover:bg-white/10 hover:text-white",
              )}
            >
              Set Up Profile →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
