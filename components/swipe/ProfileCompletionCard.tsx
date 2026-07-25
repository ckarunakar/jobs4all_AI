"use client";

import Link from "next/link";
import { ArrowRight, Check, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProfileCompletion } from "@/lib/swipe/profileCompletion";
import { useSwipeStore } from "@/lib/swipe/swipeStore";

export function ProfileCompletionCard() {
  const { profile } = useSwipeStore();
  const { percent, fields } = getProfileCompletion(profile);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Profile readiness</CardTitle>
        <Link
          href="/profile"
          className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          Edit
          <ArrowRight className="size-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted">Completion</span>
            <span className="font-mono text-lg font-semibold text-accent">
              {percent}%
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-elevated">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {fields.map((f) => (
            <li key={f.label} className="flex items-center gap-2 text-xs">
              {f.done ? (
                <Check className="size-3.5 text-[var(--recommended)]" />
              ) : (
                <Circle className="size-3.5 text-muted-foreground" />
              )}
              <span className={f.done ? "text-muted" : "text-muted-foreground"}>
                {f.label}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
