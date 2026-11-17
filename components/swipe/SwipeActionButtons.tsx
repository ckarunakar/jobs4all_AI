"use client";

import { Bookmark, Check, Send, SquareArrowOutUpRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

interface SwipeActionButtonsProps {
  onSkip: () => void;
  onSave: () => void;
  onDetails: () => void;
  onInterested: () => void;
  onReviewApply: () => void;
  disabled?: boolean;
}

function RoundButton({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center rounded-full border-[1.5px] bg-card shadow-white transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-px disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function SwipeActionButtons({
  onSkip,
  onSave,
  onDetails,
  onInterested,
  onReviewApply,
  disabled,
}: SwipeActionButtonsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-3">
        <RoundButton
          label="Skip"
          onClick={onSkip}
          disabled={disabled}
          className="size-14 border-danger-border text-danger"
        >
          <X className="size-6" />
        </RoundButton>

        <RoundButton
          label="Save"
          onClick={onSave}
          disabled={disabled}
          className="size-12 border-[var(--info)]/30 text-info-text"
        >
          <Bookmark className="size-5" />
        </RoundButton>

        <RoundButton
          label="Details"
          onClick={onDetails}
          disabled={disabled}
          className="size-12 border-border-input text-muted"
        >
          <SquareArrowOutUpRight className="size-5" />
        </RoundButton>

        <RoundButton
          label="Interested"
          onClick={onInterested}
          disabled={disabled}
          className="size-14 border-transparent bg-brand text-white shadow-button"
        >
          <Check className="size-6" />
        </RoundButton>
      </div>

      <Button
        className="w-full"
        size="lg"
        onClick={onReviewApply}
        disabled={disabled}
      >
        <Send className="size-4" />
        Review &amp; Apply
      </Button>
    </div>
  );
}
