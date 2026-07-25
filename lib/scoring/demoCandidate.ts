/**
 * Server-side demo candidate profile — the fallback used when a scoring request
 * doesn't include a profile from the client. Derived from the app's default
 * swipe profile. Replace freely; it's clearly a demo placeholder.
 */

import { DEFAULT_SWIPE_PROFILE } from "@/lib/swipe/defaultProfile";
import { toCandidateProfile } from "./adapters";
import type { CandidateProfile } from "./types";

export const DEMO_CANDIDATE_PROFILE: CandidateProfile =
  toCandidateProfile(DEFAULT_SWIPE_PROFILE);
