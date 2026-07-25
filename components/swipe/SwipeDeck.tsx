"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { SwipeJobCard } from "./SwipeJobCard";
import {
  DraggableCard,
  type DraggableCardHandle,
  type SwipeDir,
} from "./DraggableCard";
import { useScoresOptional } from "@/lib/scoring/scoresClient";
import type { SwipeDecision, SwipeJob } from "@/types/swipe";

export interface SwipeDeckHandle {
  swipe: (direction: SwipeDir) => void;
}

interface SwipeDeckProps {
  /** Jobs still awaiting a decision; the first is the active (top) card. */
  queue: SwipeJob[];
  /** Fired after a card's exit animation completes (advances the deck). */
  onDecision: (jobId: string, decision: SwipeDecision) => void;
  onDetails: (job: SwipeJob) => void;
}

/**
 * The swipe deck. Renders at most two cards:
 *  - a STATIC background preview of the next job (never draggable), and
 *  - the active `DraggableCard` on top (keyed by id so each mounts fresh).
 *
 * The deck holds no transform state itself; it just delegates the imperative
 * `swipe()` (from buttons / keyboard) to the active card so gesture and button
 * paths run identical logic.
 */
export const SwipeDeck = forwardRef<SwipeDeckHandle, SwipeDeckProps>(
  function SwipeDeck({ queue, onDecision, onDetails }, ref) {
    const activeRef = useRef<DraggableCardHandle>(null);
    const scores = useScoresOptional();

    useImperativeHandle(
      ref,
      () => ({ swipe: (dir) => activeRef.current?.swipe(dir) }),
      [],
    );

    const top = queue[0];
    const next = queue[1];
    const topEntry = top ? scores?.getEntry(top.id) : undefined;
    const nextEntry = next ? scores?.getEntry(next.id) : undefined;

    return (
      <div className="relative mx-auto w-full max-w-[600px] overflow-hidden md:max-w-[640px] lg:max-w-[680px]">
        {/* Static next-card preview — sits behind, ignores all input. */}
        {next && (
          <div
            className="pointer-events-none absolute inset-0 scale-[0.96] translate-y-3 opacity-70 select-none"
            aria-hidden
          >
            <SwipeJobCard job={next} evaluation={nextEntry?.result ?? null} />
          </div>
        )}

        {/* Active draggable card. */}
        {top && (
          <DraggableCard
            key={top.id}
            ref={activeRef}
            job={top}
            evaluation={topEntry?.result ?? null}
            scoring={topEntry?.status === "scoring"}
            onDetails={() => onDetails(top)}
            onCommit={(decision) => onDecision(top.id, decision)}
          />
        )}
      </div>
    );
  },
);
