import { targetingMatches } from "@/lib/startup/intro-v2/targeting";
import type {
  IntroResolverCandidate,
  IntroResolverInput,
} from "@/lib/startup/intro-v2/types";

function inSchedule(candidate: IntroResolverCandidate, nowMs: number): boolean {
  if (candidate.status !== "active" && candidate.status !== "scheduled") return false;
  if (candidate.startsAt) {
    const starts = Date.parse(candidate.startsAt);
    if (!Number.isFinite(starts) || nowMs < starts) return false;
  }
  if (candidate.endsAt) {
    const ends = Date.parse(candidate.endsAt);
    if (!Number.isFinite(ends) || nowMs > ends) return false;
  }
  return true;
}

export function compareIntroResolverCandidates(
  a: IntroResolverCandidate,
  b: IntroResolverCandidate
): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const aStart = a.startsAt ? Date.parse(a.startsAt) : 0;
  const bStart = b.startsAt ? Date.parse(b.startsAt) : 0;
  if (aStart !== bStart) return aStart - bStart;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function resolveIntroCampaign(
  candidates: readonly IntroResolverCandidate[],
  input: IntroResolverInput
): IntroResolverCandidate | null {
  if (!input.frequencyEligible) return null;
  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(nowMs)) return null;

  const eligible = candidates.filter((candidate) => {
    if (!inSchedule(candidate, nowMs)) return false;
    return targetingMatches(candidate.targeting, {
      audience: input.audience,
      platform: input.platform,
      deviceClass: input.deviceClass,
    });
  });
  if (eligible.length === 0) return null;
  return [...eligible].sort(compareIntroResolverCandidates)[0] ?? null;
}
