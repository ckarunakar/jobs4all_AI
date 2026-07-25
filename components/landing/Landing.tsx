import Link from "next/link";
import {
  ArrowRight,
  GalleryHorizontalEnd,
  ListChecks,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SwipeJobCard } from "@/components/swipe/SwipeJobCard";
import { MOCK_SWIPE_JOBS } from "@/lib/mockData/swipeJobs";

const FEATURES = [
  {
    icon: GalleryHorizontalEnd,
    title: "Swipe through roles",
    body: "One job at a time. Swipe right on roles worth your time, left to skip — built for fast, focused discovery.",
    block: "bg-blue-50",
    chip: "bg-primary text-white",
  },
  {
    icon: Target,
    title: "Career-Ops-style fit score",
    body: "Every card shows a single 1.0–5.0 fit score with key match reasons and caution flags, so you decide in seconds.",
    block: "bg-emerald-50",
    chip: "bg-secondary text-white",
  },
  {
    icon: ShieldCheck,
    title: "Review before applying",
    body: "Swiping right means “prepare application” — never auto-submit. You open a checklist and confirm before applying.",
    block: "bg-amber-50",
    chip: "bg-warning text-white",
  },
  {
    icon: ListChecks,
    title: "Track your pipeline",
    body: "Interested, saved, ready, applied, interview — everything you swipe lands in a clean tracker you control.",
    block: "bg-violet-50",
    chip: "bg-violet-500 text-white",
  },
];

export function Landing({ loggedIn = false }: { loggedIn?: boolean }) {
  const previewJob = MOCK_SWIPE_JOBS[0];
  const ctaHref = loggedIn ? "/swipe" : "/login";
  const ctaLabel = loggedIn ? "Open Swipe Demo" : "Login to see demo";

  return (
    <>
      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-grid">
        {/* Flat geometric decoration */}
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-blue-100/60" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 size-80 rotate-12 rounded-3xl bg-amber-100/50" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 py-16 lg:grid-cols-2 lg:py-24">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">
              <Sparkles className="size-3.5" />
              AI-ranked job search
            </span>
            <h1 className="mt-6 text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
              Swipe through{" "}
              <span className="text-primary">high-fit tech jobs</span>.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted lg:text-xl">
              AI-ranked roles for students and new grads. Focus on roles worth
              your time, then apply with full control. You review. You decide.
              You apply.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
              <Link href={ctaHref}>
                <Button size="lg" className="w-full sm:w-auto">
                  {ctaLabel}
                  <ArrowRight className="size-5" />
                </Button>
              </Link>
              <Link href="/profile">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  Set Up Profile
                </Button>
              </Link>
            </div>
            <p className="mt-5 text-sm font-medium text-muted-foreground">
              Mobile-first · mock data · no auto-apply, ever
            </p>
          </div>

          {/* Live preview card (flat) */}
          <div className="relative mx-auto h-[30rem] w-full max-w-sm select-none sm:h-[34rem] sm:max-w-[420px]">
            <div className="absolute inset-0 translate-x-3 translate-y-4 rounded-lg border-2 border-border bg-surface" />
            <div className="pointer-events-none absolute inset-0">
              <SwipeJobCard job={previewJob} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────── */}
      <section className="bg-surface">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:py-24">
          <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
            Focus on roles worth your time
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted">
            A swipe-first job search with Career-Ops-style fit scoring and
            human-confirmed applications.
          </p>
          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className={`group rounded-lg ${f.block} p-8 transition-transform duration-200 hover:scale-[1.02]`}
              >
                <div
                  className={`flex size-14 items-center justify-center rounded-md ${f.chip}`}
                >
                  <f.icon
                    className="size-7 transition-transform duration-200 group-hover:scale-110"
                    strokeWidth={2.25}
                  />
                </div>
                <h3 className="mt-5 text-xl font-bold">{f.title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Control (dark color block) ─────────────────────── */}
      <section className="bg-[#111827]">
        <div className="mx-auto max-w-5xl px-5 py-20 text-center text-white">
          <div className="mx-auto flex size-16 items-center justify-center rounded-md bg-white">
            <ShieldCheck className="size-8 text-[#111827]" strokeWidth={2.25} />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Human-confirmed applications
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/70">
            The app prepares and organizes; you decide what gets submitted.
            Nothing is ever applied automatically — swiping right simply means
            “review and apply.”
          </p>
          <p className="mt-8 text-2xl font-bold">
            You review. You decide. You apply.
          </p>
        </div>
      </section>

      {/* ── CTA (amber color block) ────────────────────────── */}
      <section className="bg-warning">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 px-5 py-16 text-center sm:flex-row sm:text-left">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-[#111827]">
              Ready to find your fit?
            </h2>
            <p className="mt-2 text-lg text-[#111827]/80">
              Start swiping through high-fit tech roles — all on mock data.
            </p>
          </div>
          <Link href={ctaHref} className="shrink-0">
            <Button
              size="lg"
              className="bg-[#111827] text-white hover:bg-black"
            >
              {ctaLabel}
              <ArrowRight className="size-5" />
            </Button>
          </Link>
        </div>
      </section>
    </>
  );
}
