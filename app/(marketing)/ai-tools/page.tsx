import Link from "next/link";
import {
  AlertTriangle,
  Check,
  FileText,
  Gauge,
  ListChecks,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { GradientText, PageHero } from "@/components/marketing/primitives";
import { cn } from "@/lib/utils/cn";
import { SCORE_BANDS } from "@/lib/careerOps/scoreUtils";

export const metadata = { title: "AI Tools · ITJobCafé" };

const linkClass = buttonVariants({ variant: "link" });

function ToolCard({
  icon: Icon,
  tile,
  title,
  body,
  href,
  linkText,
  children,
}: {
  icon: LucideIcon;
  tile: string;
  title: string;
  body: string;
  href: string;
  linkText: string;
  children: React.ReactNode;
}) {
  return (
    <article className="flex min-w-0 flex-col gap-3.5 rounded-[22px] border border-border bg-card p-6 shadow-card transition-[transform,box-shadow] duration-200 motion-safe:hover:-translate-y-0.5 sm:p-[30px]">
      <div
        aria-hidden="true"
        className="flex size-[52px] items-center justify-center rounded-[14px] text-white"
        style={{ background: tile }}
      >
        <Icon className="size-[26px]" strokeWidth={2.1} />
      </div>
      <h2 className="text-[23px] font-extrabold">{title}</h2>
      <p className="text-base leading-[1.6] text-muted">{body}</p>
      {children}
      <Link
        href={href}
        className={cn(linkClass, "mt-auto self-start pt-1.5 text-[15px] font-bold")}
      >
        {linkText}
      </Link>
    </article>
  );
}

function Pills({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

const pill = "px-3 py-1.5 text-[13px] font-bold";

export default function AiToolsPage() {
  const last = SCORE_BANDS.length - 1;
  const belowMin = SCORE_BANDS[last - 1].min.toFixed(1);

  return (
    <>
      <PageHero
        eyebrow="AI TOOLS"
        title={
          <>
            The AI behind your
            <br />
            <GradientText>matching score.</GradientText>
          </>
        }
      >
        Four tools work together to find the jobs worth your time. Here is what
        each one does, and what it never does.
      </PageHero>

      <section className="bg-[linear-gradient(180deg,#edf3fd_0%,#ffffff_40%)]">
        <div className="mx-auto grid max-w-[1240px] gap-6 px-5 pb-16 pt-2 sm:px-8 md:grid-cols-2">
          <ToolCard
            icon={FileText}
            tile="linear-gradient(135deg,#3b82f6,#8b5cf6)"
            title="Résumé reader"
            body="Upload your résumé and the AI suggests your target roles and skills. Check them, add your locations, and the AI reads both every time it scores a job for you."
            href="/profile"
            linkText="Set Up Profile →"
          >
            <Pills>
              {["PDF", "Word (.docx)", "Up to 5 MB"].map((t) => (
                <Badge key={t} variant="primary" className={pill}>
                  {t}
                </Badge>
              ))}
            </Pills>
          </ToolCard>

          <ToolCard
            icon={Gauge}
            tile="linear-gradient(135deg,#6d5ce8,#d862a6)"
            title="Fit score, 1.0 to 5.0"
            body="Once your résumé is uploaded, ask the AI to score a job, or the next 10 at once. 4.0 and up is worth applying; 4.5 and up is an excellent fit."
            href="/swipe"
            linkText="Find My Matches ↗"
          >
            <Pills>
              {SCORE_BANDS.map((b, i) => (
                <Badge key={b.band} variant={b.token} className={pill}>
                  {i === last
                    ? `Below ${belowMin} ${b.shortLabel}`
                    : `${b.min.toFixed(1)}+ ${b.shortLabel}`}
                </Badge>
              ))}
            </Pills>
          </ToolCard>

          <ToolCard
            icon={ListChecks}
            tile="linear-gradient(135deg,#10b981,#3b82f6)"
            title="Strengths and skill gaps"
            body="See why a job scored the way it did: the strengths that match, the gaps to close, and anything to watch for before you apply."
            href="/swipe"
            linkText="See it on a real job ↗"
          >
            <div className="flex flex-col gap-2 rounded-[14px] border border-border bg-panel px-4 py-3.5 text-[14.5px] font-semibold">
              <span className="flex items-center gap-2 text-excellent-text">
                <Check
                  aria-hidden="true"
                  className="size-4 shrink-0"
                  strokeWidth={3}
                />
                Strong React and TypeScript portfolio
              </span>
              <span className="flex items-center gap-2 text-caution-text">
                <AlertTriangle
                  aria-hidden="true"
                  className="size-4 shrink-0"
                  strokeWidth={2.6}
                />
                No production cloud experience yet
              </span>
            </div>
          </ToolCard>

          <ToolCard
            icon={SlidersHorizontal}
            tile="linear-gradient(135deg,#4fb3e0,#6d5ce8)"
            title="Smart filters"
            body="Narrow the feed by skills, city, job type and date posted, or let your profile preferences filter for you. Then filter your applications by fit."
            href="/swipe"
            linkText="Try the filters ↗"
          >
            <Pills>
              {[
                "Skills: Java + React",
                "City",
                "Job type",
                "Past 7 days",
                "Use my preferences",
              ].map((t) => (
                <Badge key={t} variant="info" className={pill}>
                  {t}
                </Badge>
              ))}
            </Pills>
          </ToolCard>
        </div>
      </section>

      <section className="bg-[linear-gradient(120deg,#141a3a_0%,#23286a_60%,#3b2a7a_100%)]">
        <div className="mx-auto flex max-w-[1000px] flex-wrap items-center gap-7 px-5 py-[60px] text-white sm:px-8">
          <div
            aria-hidden="true"
            className="flex size-16 flex-none items-center justify-center rounded-[18px] border border-white/25 bg-white/12"
          >
            <ShieldCheck className="size-[30px]" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-[1_1_320px]">
            <h2 className="text-[30px] font-extrabold">
              The AI scores and explains. You decide.
            </h2>
            <p className="mt-2.5 text-[17px] leading-[1.6] text-white/80">
              Nothing is ever applied automatically. Swiping right means “review
              and apply”, and you submit every application yourself.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
