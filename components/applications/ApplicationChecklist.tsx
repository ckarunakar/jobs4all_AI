"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils/cn";

export interface ChecklistItem {
  key: string;
  label: string;
  hint?: string;
}

interface ApplicationChecklistProps {
  items: ChecklistItem[];
  checked: Record<string, boolean>;
  onToggle: (key: string, value: boolean) => void;
}

export function ApplicationChecklist({
  items,
  checked,
  onToggle,
}: ApplicationChecklistProps) {
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const isChecked = !!checked[item.key];
        return (
          <li key={item.key}>
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                isChecked
                  ? "border-[var(--recommended)]/30 bg-[var(--recommended)]/5"
                  : "border-border bg-surface hover:border-border-strong",
              )}
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={(v) => onToggle(item.key, v)}
                className="mt-0.5"
              />
              <div className="min-w-0">
                <div className="text-sm font-medium">{item.label}</div>
                {item.hint && (
                  <div className="text-xs text-muted-foreground">
                    {item.hint}
                  </div>
                )}
              </div>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
