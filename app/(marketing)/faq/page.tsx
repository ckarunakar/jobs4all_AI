import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { GradientText, PageHero } from "@/components/marketing/primitives";
import type { ReactNode } from "react";

export const metadata = { title: "FAQ · ITJobCafé" };

const textLink =
  "rounded-sm text-accent underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const faqs: { q: string; a: ReactNode }[] = [
  {
    q: "What is a matching score?",
    a: "A score from 1.0 to 5.0 for how well a job fits your résumé and preferences. 4.0 and up is worth applying, and 4.5 and up is an excellent fit. Every score comes with the strengths and gaps behind it.",
  },
  {
    q: "Do I need an account?",
    a: "Not to look around: you can browse and swipe as a guest. To see fit scores, create an account and upload your résumé. Your account also saves your profile and progress, and what you did as a guest comes with you.",
  },
  {
    q: "Does ITJobCafé apply to jobs for me?",
    a: "Never. Swiping right means you are interested. You review each job and submit the application yourself on the employer’s site.",
  },
  {
    q: "What résumé files can I upload?",
    a: "PDF or Word (.docx), up to 5 MB.",
  },
  {
    q: "Who sees my résumé?",
    a: (
      <>
        To score a job, we send your résumé text, your profile details and the
        job description to one of our AI scoring providers, Anthropic or
        DeepSeek. We don’t sell your information or show ads. The{" "}
        <Link href="/privacy" className={textLink}>
          privacy policy
        </Link>{" "}
        has the details.
      </>
    ),
  },
  {
    q: "Is there a mobile app?",
    a: "Android and iPhone apps are on the way. Until then, the website works on any phone.",
  },
  {
    q: "How do I delete my account?",
    a: "Go to Settings and choose Delete account, then confirm. This removes your account and everything saved with it.",
  },
];

export default function FaqPage() {
  return (
    <section className="bg-wash">
      <PageHero
        eyebrow="FAQ"
        title={
          <>
            Questions, <GradientText>answered.</GradientText>
          </>
        }
      />
      <div className="mx-auto max-w-[860px] px-5 pb-[72px] sm:px-8">
        <div className="flex flex-col gap-3.5">
          {faqs.map((f, i) => (
            <details
              key={f.q}
              open={i === 0}
              className="group rounded-[20px] border border-border bg-card shadow-card"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-[20px] px-6 py-5 text-[18px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown
                  aria-hidden="true"
                  className="size-5 shrink-0 text-accent group-open:rotate-180 motion-safe:transition-transform"
                />
              </summary>
              <p className="px-6 pb-[22px] text-base leading-[1.65] text-muted">
                {f.a}
              </p>
            </details>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-border bg-panel px-6 py-[22px]">
          <span className="text-[17px] font-bold">Still have a question?</span>
          <Link href="/support" className={buttonVariants()}>
            Contact support
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
