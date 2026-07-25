import type { SwipeJob } from "@/types/swipe";

/**
 * The score to display for a job: the real Career-Ops AI score when it's been
 * scored, otherwise the neutral placeholder (3.0). Used everywhere a job's
 * rating is shown (cards, tracker rows, pipeline board, filters) so an AI score
 * doesn't "reset" to the placeholder when moving between views.
 */
export function swipeJobScore(job: SwipeJob): number {
  return job.careerOpsScore?.score ?? job.score;
}
