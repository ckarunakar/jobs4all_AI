import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type StatusTone = "mock" | "waiting" | "live" | "disabled";

const TONE: Record<
  StatusTone,
  { variant: React.ComponentProps<typeof Badge>["variant"]; dot: string }
> = {
  mock: { variant: "caution", dot: "var(--caution)" },
  waiting: { variant: "info", dot: "var(--info)" },
  live: { variant: "recommended", dot: "var(--recommended)" },
  disabled: { variant: "default", dot: "var(--low)" },
};

interface IntegrationStatusCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  statusLabel: string;
  tone: StatusTone;
  children?: React.ReactNode;
}

export function IntegrationStatusCard({
  icon: Icon,
  title,
  description,
  statusLabel,
  tone,
  children,
}: IntegrationStatusCardProps) {
  const t = TONE[tone];
  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-elevated text-accent">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{title}</h3>
            <Badge variant={t.variant}>
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: t.dot }}
              />
              {statusLabel}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted">{description}</p>
          {children && <div className="mt-4">{children}</div>}
        </div>
      </div>
    </Card>
  );
}
