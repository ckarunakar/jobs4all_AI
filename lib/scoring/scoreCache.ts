/**
 * Local file-based score cache (MVP).
 * --------------------------------------------------------------------------
 * Stores evaluations in data/job-scores.json keyed by inputHash, so we never
 * re-call the model for an unchanged job + profile + prompt + model.
 *
 * TODO(backend): swap this module for a DB-backed store (see SCORE.md for the
 * suggested JobScores table). The getCached/setCached signatures are the seam.
 */

import { promises as fs } from "fs";
import path from "path";
import type { JobEvaluationResult } from "./types";

const CACHE_DIR = path.join(process.cwd(), "data");
const CACHE_FILE = path.join(CACHE_DIR, "job-scores.json");

type CacheShape = Record<string, JobEvaluationResult>;

// Serialize writes so concurrent batch requests don't clobber the file.
let writeChain: Promise<void> = Promise.resolve();
let memoryCache: CacheShape | null = null;

async function readAll(): Promise<CacheShape> {
  if (memoryCache) return memoryCache;
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    memoryCache = JSON.parse(raw) as CacheShape;
  } catch {
    memoryCache = {};
  }
  return memoryCache;
}

export async function getCached(
  inputHash: string,
): Promise<JobEvaluationResult | null> {
  const all = await readAll();
  return all[inputHash] ?? null;
}

export async function setCached(
  inputHash: string,
  result: JobEvaluationResult,
): Promise<void> {
  const all = await readAll();
  all[inputHash] = result;
  memoryCache = all;

  // Append to the serialized write chain.
  writeChain = writeChain
    .then(async () => {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(CACHE_FILE, JSON.stringify(all, null, 2), "utf8");
    })
    .catch(() => {
      // Non-fatal: a failed cache write just means we re-score next time.
    });
  await writeChain;
}
