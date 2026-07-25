"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import { SwipeJobCard } from "./SwipeJobCard";
import type { SwipeDecision, SwipeJob } from "@/types/swipe";

export type SwipeDir = "left" | "right" | "up";

export interface DraggableCardHandle {
  swipe: (dir: SwipeDir) => void;
}

interface DraggableCardProps {
  job: SwipeJob;
  /** Called ONLY after the exit animation finishes — then the parent advances. */
  onCommit: (decision: SwipeDecision) => void;
  onDetails: () => void;
}

const OFFSCREEN = 1000;
const DISTANCE_THRESHOLD = 110;
const VELOCITY_THRESHOLD = 600;
const EXIT_EASE = [0.22, 1, 0.36, 1] as const;

const DIR_TO_DECISION: Record<SwipeDir, SwipeDecision> = {
  left: "skip",
  right: "interested",
  up: "save",
};

/**
 * A single draggable swipe card. Owns its OWN motion values so transforms can
 * never leak between cards. It animates fully offscreen before calling
 * `onCommit`; the parent then unmounts this card (key change) and a fresh card
 * mounts centered — so there is nothing to "reset". A per-card `busy` lock
 * prevents triggering a second swipe mid-animation.
 */
export const DraggableCard = forwardRef<DraggableCardHandle, DraggableCardProps>(
  function DraggableCard({ job, onCommit, onDetails }, ref) {
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    // Rotation is derived from x, so it tracks the drag and never goes stale.
    const rotate = useTransform(x, [-200, 0, 200], [-14, 0, 14]);
    const [hint, setHint] = useState<"interested" | "skip" | null>(null);
    const busy = useRef(false);

    const performSwipe = useCallback(
      (dir: SwipeDir) => {
        if (busy.current) return;
        busy.current = true;
        if (dir !== "up") setHint(dir === "left" ? "skip" : "interested");

        const targetX =
          dir === "left" ? -OFFSCREEN : dir === "right" ? OFFSCREEN : 0;
        const targetY = dir === "up" ? -OFFSCREEN : 0;

        const ax = animate(x, targetX, { duration: 0.34, ease: EXIT_EASE });
        const ay = animate(y, targetY, { duration: 0.34, ease: EXIT_EASE });

        // Advance ONLY once the card is fully offscreen.
        Promise.allSettled([ax.finished, ay.finished]).then(() => {
          onCommit(DIR_TO_DECISION[dir]);
        });
      },
      [onCommit, x, y],
    );

    const springBack = () => {
      setHint(null);
      animate(x, 0, { type: "spring", stiffness: 500, damping: 38 });
      animate(y, 0, { type: "spring", stiffness: 500, damping: 38 });
    };

    useImperativeHandle(ref, () => ({ swipe: performSwipe }), [performSwipe]);

    return (
      <motion.div
        className="relative z-10 cursor-grab touch-none select-none active:cursor-grabbing"
        style={{ x, y, rotate }}
        drag="x"
        dragMomentum={false}
        onDrag={(_e, info: PanInfo) => {
          if (busy.current) return;
          const ox = info.offset.x;
          setHint(ox > 50 ? "interested" : ox < -50 ? "skip" : null);
        }}
        onDragEnd={(_e, info: PanInfo) => {
          if (busy.current) return;
          const { offset, velocity } = info;
          if (offset.x > DISTANCE_THRESHOLD || velocity.x > VELOCITY_THRESHOLD) {
            performSwipe("right");
          } else if (
            offset.x < -DISTANCE_THRESHOLD ||
            velocity.x < -VELOCITY_THRESHOLD
          ) {
            performSwipe("left");
          } else {
            springBack();
          }
        }}
      >
        <SwipeJobCard job={job} onDetails={onDetails} dragHint={hint} />
      </motion.div>
    );
  },
);
