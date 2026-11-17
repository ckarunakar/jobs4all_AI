const STATS = [
  { value: "Filter fit", label: "Narrow jobs by skills, city, type and date" },
  { value: "1.0–5.0", label: "Explainable fit score" },
  { value: "One résumé", label: "Build your career profile" },
  { value: "All devices", label: "Website, Android and iPhone" },
];

/** Four at-a-glance facts under the landing hero; 4 → 2 → 1 columns. */
export function StatsStrip() {
  return (
    <section aria-label="At a glance" className="border-y border-border bg-background">
      <ul className="mx-auto grid max-w-[1240px] gap-y-6 px-5 py-7 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
        {STATS.map(({ value, label }) => (
          <li
            key={value}
            className="border-border px-4 py-1 text-center sm:even:border-l lg:not-first:border-l"
          >
            <p className="text-[25px] font-bold text-accent">{value}</p>
            <p className="mt-1.5 text-sm text-muted-foreground">{label}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
