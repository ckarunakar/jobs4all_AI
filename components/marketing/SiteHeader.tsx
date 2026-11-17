"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { SITE_NAV_LINKS } from "./nav-links";

const RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function SiteHeader({ loggedIn }: { loggedIn: boolean }) {
  const pathname = usePathname();
  // The pathname the menu was opened on. The menu counts as open only while
  // the route is unchanged, so any navigation (logo, back/forward, links)
  // closes it without an effect.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt !== null && openedAt === pathname;
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Escape closes the panel and returns focus to the menu button. The state
  // change happens inside the listener, not in the effect body.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenedAt(null);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const ctaLabel = loggedIn ? "Open the app" : "Sign in / Sign up";
  const ctaHref = loggedIn ? "/swipe" : "/login";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-8 px-5 py-3.5 sm:px-8">
        <Link
          href="/"
          aria-label="ITJobCafé home"
          className={cn("inline-flex rounded-md", RING)}
        >
          <Logo height={52} preload />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-[30px] lg:flex">
          {SITE_NAV_LINKS.map(({ label, href }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-sm pb-1 text-[15px] transition-colors",
                  RING,
                  active
                    ? "relative font-bold text-accent-strong after:absolute after:inset-x-0 after:bottom-0 after:h-[2.5px] after:rounded-full after:bg-brand"
                    : "font-semibold text-foreground hover:text-accent-strong",
                )}
              >
                {label}
              </Link>
            );
          })}
          <Link href={ctaHref} className={buttonVariants({ className: "text-[15px]" })}>
            {ctaLabel}
            <ArrowRight aria-hidden="true" />
          </Link>
        </nav>

        <button
          ref={menuButtonRef}
          type="button"
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={() => setOpenedAt(open ? null : pathname)}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "lg:hidden",
          )}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          Menu
        </button>
      </div>

      {open ? (
        <nav
          id="site-menu"
          aria-label="Main"
          className="border-t border-border bg-background px-5 pb-5 pt-3 sm:px-8 lg:hidden"
        >
          <ul className="flex flex-col">
            {SITE_NAV_LINKS.map(({ label, href }) => {
              const active = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpenedAt(null)}
                    className={cn(
                      "block rounded-md py-3 text-base",
                      RING,
                      active
                        ? "font-bold text-accent-strong"
                        : "font-semibold text-foreground hover:text-accent-strong",
                    )}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link
            href={ctaHref}
            onClick={() => setOpenedAt(null)}
            className={buttonVariants({ className: "mt-3 w-full" })}
          >
            {ctaLabel}
            <ArrowRight aria-hidden="true" />
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
