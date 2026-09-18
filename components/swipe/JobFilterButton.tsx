"use client";

/**
 * Filters control for the swipe page: a header button (with an active-count
 * badge) that opens a slide-out panel. Filtering is server-side — Apply calls
 * loadFilteredJobs() which fetches only matching jobs from /api/jobs. The city
 * field is a validated autocomplete (options from /api/jobs/filter-options), so
 * typos can't become dead filters.
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Filter, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import { TagInput } from "@/components/profile/TagInput";
import { useSwipeStore, type JobFilterState } from "@/lib/swipe/swipeStore";

const RECENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any time" },
  { value: "1", label: "Past 24 hours" },
  { value: "7", label: "Past 7 days" },
  { value: "30", label: "Past 30 days" },
];

// Client mirror of the server's skill rules (route re-enforces them).
const MAX_SKILLS = 3;
const MAX_SKILL_LEN = 40;

export function JobFilterButton() {
  const {
    jobFilters,
    activeFilterCount,
    loadFilteredJobs,
    clearJobFilters,
    filtering,
    usePreferenceFilters,
    prefFilterSummary,
    setUsePreferenceFilters,
    hydrated,
  } = useSwipeStore();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<JobFilterState>({});
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [commonCities, setCommonCities] = useState<string[]>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);

  // City autocomplete state.
  const [cityInput, setCityInput] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [cityMenuOpen, setCityMenuOpen] = useState(false);
  const [cityError, setCityError] = useState<string | null>(null);

  const openPanel = useCallback(() => {
    // Seed the draft from the currently-applied filters.
    setDraft(jobFilters);
    setCityInput(jobFilters.city ?? "");
    setCityError(null);
    setCityMenuOpen(false);
    setOpen(true);
    if (!optionsLoaded) {
      fetch("/api/jobs/filter-options")
        .then((r) => r.json())
        .then((d) => {
          if (d?.ok) {
            setJobTypes(d.jobTypes ?? []);
            setCommonCities(d.commonCities ?? []);
            setOptionsLoaded(true);
          }
        })
        .catch(() => {});
    }
  }, [jobFilters, optionsLoaded]);

  // Debounced city autocomplete — only when the panel is open and text exists.
  useEffect(() => {
    if (!open) return;
    const q = cityInput.trim();
    // Empty input shows the common-cities list, so nothing to fetch/clear here.
    if (!q) return;
    const t = setTimeout(() => {
      fetch(`/api/jobs/filter-options?citySearch=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d?.ok) setCitySuggestions(d.cities ?? []);
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [cityInput, open]);

  const selectCity = (city: string) => {
    setDraft((d) => ({ ...d, city }));
    setCityInput(city);
    setCityMenuOpen(false);
    setCityError(null);
  };

  const clearCity = () => {
    setDraft((d) => ({ ...d, city: undefined }));
    setCityInput("");
    setCityError(null);
    setCityMenuOpen(false);
  };

  // Clean chips like the server will: trim, truncate, CI-dedupe, cap at 3.
  const setSkills = (next: string[]) => {
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const raw of next) {
      const s = raw.trim().slice(0, MAX_SKILL_LEN);
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cleaned.push(s);
      if (cleaned.length === MAX_SKILLS) break;
    }
    setDraft((d) => ({ ...d, skills: cleaned.length ? cleaned : undefined }));
  };

  const applyFilters = async () => {
    const typed = cityInput.trim();
    // City filter requires a selection from the list (blocks typo filters).
    if (typed && draft.city !== typed) {
      setCityError("Select a city from the list.");
      setCityMenuOpen(true);
      return;
    }
    const next: JobFilterState = {
      ...draft,
      city: typed ? draft.city : undefined,
    };
    setOpen(false);
    const res = await loadFilteredJobs(next);
    if (res.stale) return;
    if (res.ok) {
      toast(
        res.count > 0
          ? `Showing ${res.count} matching job${res.count === 1 ? "" : "s"}`
          : "No jobs matched those filters",
        res.count > 0 ? "success" : "default",
      );
    } else {
      toast(res.error ?? "Couldn't apply filters", "danger");
    }
  };

  const clearAll = () => {
    setDraft({});
    setCityInput("");
    setCityError(null);
    setCityMenuOpen(false);
    setOpen(false);
    clearJobFilters();
  };

  // What to show in the dropdown: typed → DB matches; empty → popular cities.
  const suggestions = cityInput.trim() ? citySuggestions : commonCities;

  return (
    <>
      {hydrated && usePreferenceFilters && prefFilterSummary && (
        <button
          type="button"
          onClick={openPanel}
          className="rounded-full border border-primary/40 bg-primary-soft px-2.5 py-1 text-xs font-medium text-accent"
        >
          Preferences on
        </button>
      )}

      <Button variant="ghost" size="sm" onClick={openPanel}>
        <Filter className="size-4" />
        Filters
        {activeFilterCount > 0 && (
          <Badge variant="primary" className="ml-1">
            {activeFilterCount}
          </Badge>
        )}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        side="right"
        title="Filter jobs"
        description="Filtering runs in SQL — only matching jobs are loaded."
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              disabled={filtering}
            >
              Clear filters
            </Button>
            <div className="flex-1" />
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={applyFilters} disabled={filtering}>
              Apply filters
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Preference baseline */}
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label htmlFor="f-prefs">Use my preferences</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {prefFilterSummary
                    ? `${prefFilterSummary} — set on your profile`
                    : "Add preferences on your profile to filter by default"}
                </p>
              </div>
              {prefFilterSummary && (
                <Checkbox
                  id="f-prefs"
                  checked={usePreferenceFilters}
                  onCheckedChange={setUsePreferenceFilters}
                  disabled={!hydrated || filtering}
                />
              )}
            </div>
          </div>

          {/* Job type */}
          <div className="space-y-2">
            <Label htmlFor="f-jobtype">Job type</Label>
            <Select
              id="f-jobtype"
              value={draft.jobType ?? ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, jobType: e.target.value || undefined }))
              }
            >
              <option value="">Any job type</option>
              {jobTypes.map((jt) => (
                <option key={jt} value={jt}>
                  {jt}
                </option>
              ))}
            </Select>
          </div>

          {/* Skills */}
          <div className="space-y-2">
            <Label>Skills</Label>
            <TagInput
              values={draft.skills ?? []}
              onChange={setSkills}
              placeholder="e.g. python, react, c++…"
            />
            <p className="text-xs text-muted-foreground">
              Every skill you add must appear as a whole word in the job
              description — e.g. python, react, c++
            </p>
          </div>

          {/* City autocomplete */}
          <div className="space-y-2">
            <Label htmlFor="f-city">City</Label>
            <div className="relative">
              <Input
                id="f-city"
                placeholder="Type a city…"
                autoComplete="off"
                value={cityInput}
                onFocus={() => setCityMenuOpen(true)}
                onBlur={() => setTimeout(() => setCityMenuOpen(false), 150)}
                onChange={(e) => {
                  const v = e.target.value;
                  setCityInput(v);
                  setCityMenuOpen(true);
                  setCityError(null);
                  // Typing away from a selection clears it (must re-select).
                  if (draft.city && v.trim() !== draft.city) {
                    setDraft((d) => ({ ...d, city: undefined }));
                  }
                }}
              />
              {cityInput && (
                <button
                  type="button"
                  onClick={clearCity}
                  aria-label="Clear city"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:bg-elevated hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
              {cityMenuOpen && suggestions.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-card py-1">
                  {!cityInput.trim() && (
                    <p className="px-3 py-1 text-xs font-medium text-muted-foreground">
                      Popular cities
                    </p>
                  )}
                  {suggestions.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectCity(c)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-elevated"
                    >
                      <span className="truncate">{c}</span>
                      {draft.city === c && (
                        <Check className="size-4 shrink-0 text-accent" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {cityError ? (
              <p className="text-xs text-[var(--danger)]">{cityError}</p>
            ) : draft.city ? (
              <p className="text-xs text-muted-foreground">
                Filtering by{" "}
                <span className="font-medium text-foreground">{draft.city}</span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Pick from the list — typed-only cities aren&apos;t applied.
              </p>
            )}
          </div>

          {/* Recency */}
          <div className="space-y-2">
            <Label htmlFor="f-recency">Date posted</Label>
            <Select
              id="f-recency"
              value={draft.postedWithinDays ? String(draft.postedWithinDays) : ""}
              onChange={(e) => {
                const v = e.target.value;
                setDraft((d) => ({
                  ...d,
                  postedWithinDays: v
                    ? (Number(v) as 1 | 7 | 30)
                    : undefined,
                }));
              }}
            >
              {RECENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>

          {/* Sort */}
          <div className="space-y-2">
            <Label htmlFor="f-sort">Sort</Label>
            <Select
              id="f-sort"
              value={draft.sort ?? "default"}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  sort: e.target.value === "newest" ? "newest" : "default",
                }))
              }
            >
              <option value="default">Default (diverse mix)</option>
              <option value="newest">Newest first</option>
            </Select>
          </div>
        </div>
      </Dialog>
    </>
  );
}
