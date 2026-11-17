import Link from "next/link";
import { ArrowUpRight, Briefcase, Laptop, Upload, Users } from "lucide-react";
import {
  formatScore,
  getScoreLabel,
  scoreFraction,
} from "@/lib/careerOps/scoreUtils";

/*
  Landing hero illustration: one résumé feeding three scored jobs, drawn in
  markup and CSS. Illustration art may use hex values (see types/design.md).
  The art is a single role="img"; the floating score card is a real link and
  sits outside it.
*/

const ART = {
  panel: "linear-gradient(145deg, #2a5ad6 0%, #1f49bd 42%, #142f8c 100%)",
  glow: "radial-gradient(circle at 60% 60%, rgba(110,170,255,0.5), rgba(110,170,255,0) 62%)",
  dots: "radial-gradient(rgba(255,255,255,0.38) 1.2px, rgba(255,255,255,0) 1.4px)",
  resume: "linear-gradient(160deg, #edf4ff 0%, #cddffd 100%)",
  fold: "linear-gradient(225deg, #dbe7fd 50%, #f1f6ff 50%)",
  node: "linear-gradient(160deg, #edf4ff, #c7dbfd)",
  row: "linear-gradient(90deg, rgba(234,242,255,0.97), rgba(199,221,253,0.92))",
};

const RING_FILL = "#2563eb";
const RING_TRACK = "rgba(191,219,254,0.95)";

/** Connector lines between the résumé, the node and the rows. */
const LINE = "h-[3px] bg-[rgba(219,234,254,0.85)]";

/** The headline score on the floating card. */
const FEATURED_SCORE = 5.0;

/** Target with an arrow in it (the third row's icon). */
function TargetIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
      <path d="m13.5 10.5 7-7" />
      <path d="M17 3.5h3.5V7" />
    </svg>
  );
}

const ROWS = [
  { score: 5.0, Icon: Laptop },
  { score: 4.0, Icon: Users },
  { score: 2.0, Icon: TargetIcon },
];

/** Score ring filled on the app's own 1.0–5.0 scale. */
function ScoreRing({ score }: { score: number }) {
  const fill = scoreFraction(score) * 100;
  return (
    <div
      className="ml-auto flex size-12 flex-none rounded-full p-1 sm:size-[62px] sm:p-1.5"
      style={{
        background: `conic-gradient(${RING_FILL} 0 ${fill}%, ${RING_TRACK} 0)`,
      }}
    >
      <div className="flex size-full items-center justify-center rounded-full bg-white text-sm font-extrabold text-[#142a6b] sm:text-lg">
        {formatScore(score)}
      </div>
    </div>
  );
}

/** One glassy job row: line icon, two placeholder bars (≥640px), score ring. */
function JobRow({
  score,
  Icon,
}: {
  score: number;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <div
      className="relative flex min-h-14 items-center gap-2 rounded-[14px] border-[1.5px] border-white/85 py-1.5 pl-2 pr-1.5 shadow-[0_8px_18px_-10px_rgba(10,30,90,0.55)] sm:min-h-20 sm:gap-3 sm:rounded-[18px] sm:py-2 sm:pl-3.5 sm:pr-2.5"
      style={{ background: ART.row }}
    >
      <div className={`absolute -left-[13.5px] top-1/2 -mt-[1.5px] w-3 sm:-left-[21px] sm:w-5 ${LINE}`} />
      <Icon
        strokeWidth={1.8}
        className="size-6 flex-none text-[#1d4ed8] sm:size-[34px]"
      />
      <div className="hidden min-w-0 flex-1 flex-col gap-[7px] sm:flex">
        <div className="h-[7px] w-4/5 rounded bg-[#6aa0f5]" />
        <div className="h-[7px] w-[54%] rounded bg-[#6aa0f5]" />
      </div>
      <ScoreRing score={score} />
    </div>
  );
}

/** The stacked résumé card: a document with a person icon, then an upload box. */
function ResumeCard() {
  return (
    <div className="relative flex-[0_0_31%]">
      <div className="absolute -bottom-2 -left-2 right-2 top-3 rounded-[14px] border border-white/55 bg-[rgba(191,219,254,0.55)] sm:-bottom-3.5 sm:-left-3.5 sm:right-3.5 sm:top-[18px] sm:rounded-[18px]" />
      <div
        className="relative rounded-[14px] border-[1.5px] border-white/90 p-2 shadow-[0_14px_24px_-12px_rgba(5,20,80,0.55)] sm:rounded-[18px] sm:p-3.5"
        style={{ background: ART.resume }}
      >
        <div className="relative flex flex-col items-center gap-[5px] rounded-lg bg-white px-2 py-2.5 sm:gap-[7px] sm:rounded-[10px] sm:px-3 sm:py-3.5">
          <div
            className="absolute right-0 top-0 size-3 rounded-tr-lg sm:size-[18px] sm:rounded-tr-[10px]"
            style={{ background: ART.fold }}
          />
          <svg viewBox="0 0 24 24" className="size-6 text-[#2563eb] sm:size-[34px]">
            <circle cx="12" cy="8" r="4.2" fill="currentColor" />
            <path d="M3.8 21a8.2 8.2 0 0 1 16.4 0z" fill="currentColor" />
          </svg>
          <div className="h-1 w-[82%] rounded-[3px] bg-[#5b8def] sm:h-1.5" />
          <div className="h-1 w-[92%] rounded-[3px] bg-[#5b8def] sm:h-1.5" />
          <div className="h-1 w-[66%] rounded-[3px] bg-[#5b8def] sm:h-1.5" />
        </div>
        <div className="mt-2 flex h-10 items-center justify-center rounded-lg border border-dashed border-[#5b8def] sm:mt-3 sm:h-[62px] sm:rounded-[10px]">
          <Upload strokeWidth={2.2} className="size-5 text-[#2563eb] sm:size-[26px]" />
        </div>
      </div>
    </div>
  );
}

export function MatchIllustration() {
  return (
    <div className="relative pb-10">
      <div
        role="img"
        aria-label="Your résumé matched to three jobs with fit scores of 5.0, 4.0 and 2.0"
        className="rounded-[30px] bg-white p-[7px] shadow-[0_30px_60px_-24px_rgba(40,50,140,0.38),0_0_0_1px_rgba(120,110,200,0.12)]"
      >
        <div
          aria-hidden="true"
          className="relative flex min-h-[300px] items-center overflow-hidden rounded-[24px] px-3.5 pb-14 pt-7 sm:min-h-[360px] sm:pb-[58px] sm:pl-[30px] sm:pr-6 sm:pt-10"
          style={{ background: ART.panel }}
        >
          {/* Waves and the dot grid */}
          <div
            className="absolute -left-[22%] -top-[48%] size-[95%] rounded-full"
            style={{ background: ART.glow }}
          />
          <div className="absolute -bottom-[62%] -left-[15%] h-[85%] w-[130%] rounded-full border-t border-[rgba(160,205,255,0.55)] bg-[rgba(70,140,250,0.28)]" />
          <div
            className="absolute bottom-3.5 right-4 h-[70px] w-[130px]"
            style={{ backgroundImage: ART.dots, backgroundSize: "9px 9px" }}
          />

          <div className="relative flex w-full items-center">
            <ResumeCard />

            <div className={`flex-[0_0_8px] sm:flex-[0_0_16px] ${LINE}`} />
            <div
              className="flex size-9 flex-none items-center justify-center rounded-full border-[1.5px] border-white/90 shadow-[0_8px_18px_-8px_rgba(5,20,80,0.6)] sm:size-[54px] sm:border-[3px]"
              style={{ background: ART.node }}
            >
              <Briefcase strokeWidth={2.2} className="size-4 text-[#1d4ed8] sm:size-6" />
            </div>
            <div className={`flex-[0_0_6px] sm:flex-[0_0_12px] ${LINE}`} />

            <div className="relative flex min-w-0 flex-1 flex-col gap-2.5 pl-3 sm:gap-4 sm:pl-5">
              <div className="absolute bottom-7 left-0 top-7 w-[3px] bg-[rgba(219,234,254,0.85)] sm:bottom-10 sm:top-10" />
              {ROWS.map(({ score, Icon }) => (
                <JobRow key={score} score={score} Icon={Icon} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <Link
        href="/swipe"
        className="absolute bottom-0 left-2 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-[0_18px_40px_-16px_rgba(40,50,140,0.45)] transition-[transform,box-shadow] duration-200 hover:shadow-[0_22px_44px_-16px_rgba(40,50,140,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-safe:hover:-translate-y-px sm:-left-[18px] sm:gap-3.5 sm:px-[18px] sm:py-3.5"
      >
        <span className="text-[28px] font-extrabold leading-none tracking-[-0.02em] text-excellent-text sm:text-[32px]">
          {formatScore(FEATURED_SCORE)}
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-[15px] font-bold text-foreground">
            {getScoreLabel(FEATURED_SCORE)}
          </span>
          <span className="text-[13px] font-medium text-muted-foreground">
            See your job-fit insights
          </span>
        </span>
        <ArrowUpRight
          aria-hidden="true"
          strokeWidth={2.5}
          className="ml-1 size-[18px] flex-none text-excellent-text sm:ml-2"
        />
      </Link>
    </div>
  );
}
