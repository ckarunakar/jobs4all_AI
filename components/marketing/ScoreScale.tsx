import {
  SCORE_BANDS,
  SCORE_MAX,
  SCORE_MIN,
} from "@/lib/careerOps/scoreUtils";

type Band = (typeof SCORE_BANDS)[number]["band"];

/* Literal class names so Tailwind can see them. */
const FILL: Record<Band, string> = {
  "not-recommended": "bg-scale-none",
  weak: "bg-low",
  possible: "bg-scale-possible",
  good: "bg-caution",
  strong: "bg-recommended",
  excellent: "bg-excellent",
};

const LABEL_INK: Partial<Record<Band, string>> = {
  strong: "text-recommended-text",
  excellent: "text-excellent-text",
};

/** Bands low to high, each with its upper bound (the next band's min). */
const segments = [...SCORE_BANDS].reverse().map((b, i, asc) => {
  const upper = i === asc.length - 1 ? SCORE_MAX : asc[i + 1].min;
  const isLowest = i === 0;
  return {
    band: b.band,
    name: b.shortLabel,
    grow: upper - b.min,
    range: isLowest
      ? `${SCORE_MIN.toFixed(1)}–${(upper - 0.1).toFixed(1)}`
      : `${b.min.toFixed(1)}+`,
    ink: LABEL_INK[b.band] ?? "text-muted",
  };
});

const description = `Score scale from ${SCORE_MIN.toFixed(1)} to ${SCORE_MAX.toFixed(1)}: ${segments
  .map((s) => `${s.name} ${s.range}`)
  .join(", ")}`;

export function ScoreScale() {
  return (
    <div role="img" aria-label={description}>
      <div className="flex h-[18px] overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]">
        {segments.map((s) => (
          <div
            key={s.band}
            className={FILL[s.band]}
            style={{ flex: `${s.grow} 1 0` }}
          />
        ))}
      </div>

      {/* Wide screens: labels sit under their segments. */}
      <div className="mt-3 hidden text-center text-[13px] font-bold sm:flex">
        {segments.map((s) => (
          <div
            key={s.band}
            className={`min-w-0 ${s.ink}`}
            style={{ flex: `${s.grow} 1 0` }}
          >
            {s.name}
            <div className="font-medium text-muted">{s.range}</div>
          </div>
        ))}
      </div>

      {/* Narrow screens: the segments are too small for labels, so list them. */}
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] font-bold sm:hidden">
        {segments.map((s) => (
          <li key={s.band} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`size-3 flex-none rounded-full ${FILL[s.band]}`}
            />
            <span className={s.ink}>
              {s.name}
              <span className="block font-medium text-muted">{s.range}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
