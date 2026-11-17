"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { MobileNav } from "./MobileNav";
import { useSwipeStore } from "@/lib/swipe/swipeStore";

interface SwipeShellProps {
  title?: string;
  description?: string;
  /** Let the swipe page use the full height without extra padding. */
  flush?: boolean;
  /** Optional header controls rendered to the left of Reset (e.g. Filters). */
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

/** Mobile-first app frame: top bar + scrollable content + bottom tab nav. */
export function SwipeShell({
  title,
  description,
  flush,
  headerActions,
  children,
}: SwipeShellProps) {
  const { reset, isLoggedIn } = useSwipeStore();

  return (
    <div className="flex min-h-screen flex-col bg-wash">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between bg-card px-4">
        <Link href="/" aria-label="ITJobCafé home" className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <Logo height={30} />
        </Link>
        <div className="flex items-center gap-1.5">
          {headerActions}
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="size-4" />
            Reset
          </Button>
          {!isLoggedIn && (
            <Link href="/login" className={buttonVariants({ size: "sm" })}>
              Log in
            </Link>
          )}
        </div>
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-banner" />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-24 pt-5 sm:px-6">
        {title && (
          <div className={flush ? "" : "mb-5"}>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {description && (
              <p className="mt-1 text-sm text-muted">{description}</p>
            )}
          </div>
        )}
        {children}
      </main>

      <MobileNav />
    </div>
  );
}
