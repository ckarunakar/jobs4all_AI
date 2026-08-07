"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b-2 border-border bg-background px-4">
        <Link href="/" className="flex items-center gap-2">
          <Logo showWordmark={false} />
          <span className="text-sm font-bold">
            ITJob<span className="text-primary">Cafe</span>
          </span>
          <Badge variant="primary" className="ml-1">
            Swipe
          </Badge>
        </Link>
        <div className="flex items-center gap-1.5">
          {headerActions}
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="size-4" />
            Reset
          </Button>
          {!isLoggedIn && (
            <Link href="/login">
              <Button size="sm">Log in</Button>
            </Link>
          )}
        </div>
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
