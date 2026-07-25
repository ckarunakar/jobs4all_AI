"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSwipeStore } from "@/lib/swipe/swipeStore";
import { useToast } from "@/components/ui/toast";

/** Dev/testing: clears the logged-in user's seen-job history so jobs resurface. */
export function DevClearSeenButton() {
  const { clearSeenJobs } = useSwipeStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    setLoading(true);
    const res = await clearSeenJobs();
    setLoading(false);
    toast(
      res.ok ? "Seen-job history cleared" : (res.error ?? "Couldn't clear"),
      res.ok ? "success" : "danger",
    );
  };

  return (
    <Button variant="secondary" onClick={onClick} disabled={loading}>
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Trash2 className="size-4" />
      )}
      Clear seen-job history
    </Button>
  );
}
