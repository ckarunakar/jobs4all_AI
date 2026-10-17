"use client";

/**
 * Settings → Delete account. Confirms with the password (or, for password-less
 * Google accounts, the email), calls POST /api/account/delete, then clears this
 * browser's swipe state (the resume-derived profile lives in localStorage),
 * signs out, and hard-navigates home so no signed-in page state survives.
 * Doubles as Google Play's required web path for deleting an account.
 */

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Loader2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STORAGE_KEY, importFlagKey } from "@/lib/swipe/swipeStore";

const GENERIC_ERROR = "Could not delete the account. Please try again.";

export function DeleteAccountCard({
  email,
  hasPassword,
}: {
  email: string;
  hasPassword: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setValue("");
    setError(null);
  };

  const onDelete = async () => {
    if (busy || !value.trim()) return;
    setError(null);
    setBusy(true);

    let deleted = false;
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          hasPassword ? { password: value } : { confirmEmail: value },
        ),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      deleted = res.ok && Boolean(data?.ok);
      if (!deleted) setError(data?.error ?? GENERIC_ERROR);
    } catch {
      setError(GENERIC_ERROR);
    }

    if (!deleted) {
      setBusy(false);
      return;
    }

    // The account is gone. Clean up this browser, then leave — none of this
    // can un-delete, so failures here are ignored.
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(importFlagKey(email));
    } catch {
      // storage unavailable — nothing to clear
    }
    await signOut({ redirect: false }).catch(() => undefined);
    window.location.assign("/");
  };

  return (
    <>
      <Card className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-elevated text-[var(--danger)]">
            <Trash2 className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">Delete account</h3>
            <p className="mt-1 text-sm text-muted">
              Permanently delete your account and everything saved with it.
              This can&apos;t be undone.
            </p>
            <div className="mt-4">
              <Button variant="danger" onClick={() => setOpen(true)}>
                <Trash2 className="size-4" />
                Delete account
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Dialog
        open={open}
        onClose={close}
        title="Delete your account?"
        description="This is permanent and can't be undone."
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => void onDelete()}
              disabled={busy || !value.trim()}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? "Deleting…" : "Delete account"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium">This deletes:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              <li>Your account ({email})</li>
              <li>Your saved, applied and skipped jobs, and your notes</li>
              <li>Your uploaded resumes</li>
              <li>Your AI fit scores</li>
            </ul>
          </div>
          <form
            className="space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void onDelete();
            }}
          >
            <Label htmlFor="delete-confirm">
              {hasPassword
                ? "Enter your password to confirm"
                : `Type ${email} to confirm`}
            </Label>
            <Input
              id="delete-confirm"
              type={hasPassword ? "password" : "email"}
              autoComplete={hasPassword ? "current-password" : "off"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={busy}
            />
          </form>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        </div>
      </Dialog>
    </>
  );
}
