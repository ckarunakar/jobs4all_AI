"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** "right" = slide-over panel, "center" = centered modal. */
  side?: "right" | "center";
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Pinned footer (e.g. action buttons). */
  footer?: React.ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onClose,
  side = "center",
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
  // Close on Escape + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Render nothing until open, and only in the browser.
  if (!open || typeof document === "undefined") return null;

  // Portal to <body> so the overlay escapes any parent stacking context (e.g.
  // the sticky header when the filter panel is triggered from a header button)
  // and layers above the fixed bottom nav.
  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <div
        className="absolute inset-0 bg-foreground/40"
        onClick={onClose}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "absolute flex flex-col bg-card",
          side === "right"
            ? "inset-y-0 right-0 w-full max-w-xl border-l-2 border-border-strong animate-[slideIn_0.2s_ease-out]"
            : "left-1/2 top-1/2 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-border-strong",
          className,
        )}
      >
        {(title || description) && (
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border p-5">
            <div className="min-w-0">
              {title && (
                <h2 className="text-lg font-semibold tracking-tight">
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-1 text-sm text-muted">{description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-md p-1 text-muted hover:bg-elevated hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-border p-5">{footer}</div>
        )}
      </div>

      <style jsx global>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
