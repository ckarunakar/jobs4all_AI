"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn } from "lucide-react";
import { SWIPE_NAV_ITEMS, type SwipeNavItem } from "./swipe-nav-items";
import { useSwipeStore } from "@/lib/swipe/swipeStore";
import { cn } from "@/lib/utils/cn";

const LOGIN_ITEM: SwipeNavItem = { label: "Log in", href: "/login", icon: LogIn };

/** Bottom tab bar — the primary navigation for the mobile-first swipe flow. */
export function MobileNav() {
  const pathname = usePathname();
  const { isLoggedIn } = useSwipeStore();
  const items = isLoggedIn ? SWIPE_NAV_ITEMS : [...SWIPE_NAV_ITEMS, LOGIN_ITEM];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card shadow-up">
      <div className="mx-auto flex max-w-2xl items-stretch justify-around">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                active
                  ? "font-bold text-accent-strong"
                  : "text-muted hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "rounded-full px-4 py-1",
                  active && "bg-panel",
                )}
              >
                <item.icon
                  className="size-5"
                  strokeWidth={active ? 2.5 : 2}
                />
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
