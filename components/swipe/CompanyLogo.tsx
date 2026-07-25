import { cn } from "@/lib/utils/cn";

/** Placeholder company "logo": initials on a tinted tile using the job's accent. */
export function CompanyLogo({
  company,
  color,
  size = 48,
  className,
}: {
  company: string;
  color: string;
  size?: number;
  className?: string;
}) {
  const initials = company
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl font-semibold",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        color,
        backgroundColor: `${color}1f`,
        border: `1px solid ${color}40`,
      }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
