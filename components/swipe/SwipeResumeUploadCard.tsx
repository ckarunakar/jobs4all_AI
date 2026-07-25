"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Plus, Star, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSwipeStore } from "@/lib/swipe/swipeStore";
import { useToast } from "@/components/ui/toast";
import type { ResumeFileRef } from "@/lib/careerOps/types";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ACCEPT = ".pdf,.docx";

/**
 * Resume upload — real upload to SQL Server (dbo.temp_tbl_resume_upload) via
 * /api/resume-upload. Name/email come from the profile store; the DB row ID is
 * kept on each ResumeFileRef so the resume can later be read by AI for scoring.
 */
export function SwipeResumeUploadCard() {
  const { profile, updateProfile } = useSwipeStore();
  const { resumes, primaryResumeId } = profile;
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const pickFile = () => inputRef.current?.click();

  const handleFile = async (file: File) => {
    // Client-side guards (the API re-validates server-side).
    const name = file.name.toLowerCase();
    if (!name.endsWith(".pdf") && !name.endsWith(".docx")) {
      toast("Only .pdf and .docx files are allowed", "danger");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast("Resume is too large (max 5 MB)", "danger");
      return;
    }
    if (!profile.email.trim()) {
      toast("Add your email in the Links section first", "warning");
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.append("resume", file);
      body.append("fullName", profile.fullName);
      body.append("email", profile.email);
      if (profile.phone) body.append("phone", profile.phone);

      const res = await fetch("/api/resume-upload", { method: "POST", body });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        toast(data?.error ?? "Upload failed", "danger");
        return;
      }

      const next: ResumeFileRef = {
        id: `resume-${data.id ?? Date.now()}`,
        label: file.name.replace(/\.(pdf|docx)$/i, ""),
        fileName: file.name,
        uploadedAt: new Date().toISOString().slice(0, 10),
        parsed: false,
        dbId: data.id,
      };
      updateProfile({
        resumes: [...resumes, next],
        primaryResumeId: primaryResumeId ?? next.id,
      });
      toast("Resume uploaded", "success");
    } catch {
      toast("Upload failed — check your connection", "danger");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = ""; // allow re-selecting
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const remove = (id: string) => {
    // Removes from the list only (does not delete the row in the DB).
    const filtered = resumes.filter((r) => r.id !== id);
    updateProfile({
      resumes: filtered,
      primaryResumeId:
        primaryResumeId === id ? filtered[0]?.id : primaryResumeId,
    });
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={onInputChange}
      />

      {/* Phone (optional) */}
      <div className="space-y-2">
        <Label htmlFor="resume-phone">Phone (optional)</Label>
        <Input
          id="resume-phone"
          type="tel"
          placeholder="(555) 123-4567"
          value={profile.phone ?? ""}
          onChange={(e) => updateProfile({ phone: e.target.value })}
        />
      </div>

      {/* Dropzone / picker */}
      <button
        type="button"
        onClick={pickFile}
        disabled={uploading}
        className="flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface/50 px-6 py-8 text-center transition-colors hover:border-primary/50 hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-60"
      >
        <div className="flex size-11 items-center justify-center rounded-full bg-elevated text-accent">
          {uploading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <UploadCloud className="size-5" />
          )}
        </div>
        <p className="mt-2 text-sm font-medium">
          {uploading ? "Uploading…" : "Upload resume (.pdf or .docx)"}
        </p>
        <p className="text-xs text-muted-foreground">
          Stored securely — max 5 MB
        </p>
      </button>

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          Your resumes ({resumes.length})
        </span>
        <Button variant="ghost" size="sm" onClick={pickFile} disabled={uploading}>
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>

      {resumes.map((r) => {
        const isPrimary = r.id === primaryResumeId;
        return (
          <div
            key={r.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-elevated text-muted">
              <FileText className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{r.label}</span>
                {isPrimary && (
                  <Badge variant="primary">
                    <Star className="size-3" />
                    Primary
                  </Badge>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {r.fileName}
              </p>
            </div>
            {!isPrimary && (
              <button
                type="button"
                onClick={() => updateProfile({ primaryResumeId: r.id })}
                className="text-xs font-medium text-accent hover:underline"
              >
                Primary
              </button>
            )}
            <button
              type="button"
              onClick={() => remove(r.id)}
              className="rounded-md p-1.5 text-muted hover:bg-elevated hover:text-[var(--danger)]"
              aria-label="Remove"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
