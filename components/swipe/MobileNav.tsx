"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SWIPE_NAV_ITEMS } from "./swipe-nav-items";
import { cn } from "@/lib/utils/cn";

/** Bottom tab bar — the primary navigation for the mobile-first swipe demo. */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-border bg-background">
      <div className="mx-auto flex max-w-2xl items-stretch justify-around">
        {SWIPE_NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors",
                active ? "text-primary" : "text-muted hover:text-foreground",
              )}
            >
              <item.icon
                className="size-5"
                strokeWidth={active ? 2.5 : 2}
              />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
