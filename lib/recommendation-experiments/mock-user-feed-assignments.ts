/**
 * 32단계: 사용자 피드 버전 배정 mock (실험군 할당)
 */

import type {
  UserFeedAssignment,
  AssignedGroup,
} from "@/lib/types/recommendation-experiment";
import type { RecommendationExperiment } from "@/lib/types/recommendation-experiment";
import { getRunningExperiments } from "./mock-recommendation-experiments";

const ASSIGNMENTS: UserFeedAssignment[] = [
  {
    id: "ufa-1",
    userId: "me",
    experimentId: "exp-1",
    assignedVersionId: "fv-variant-a-home",
    assignedGroup: "variant_a",
    assignedAt: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
    region: "마닐라",
    memberType: "normal",
  },
  {
    id: "ufa-2",
    userId: "user2",
    experimentId: "exp-1",
    assignedVersionId: "fv-control-home",
    assignedGroup: "control",
    assignedAt: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
    region: "마닐라",
    memberType: "premium",
  },
];

export function getUserFeedAssignments(filters?: {
  userId?: string;
  experimentId?: string;
  versionId?: string;
}): UserFeedAssignment[] {
  let list = [...ASSIGNMENTS];
  if (filters?.userId) list = list.filter((a) => a.userId === filters.userId);
  if (filters?.experimentId)
    list = list.filter((a) => a.experimentId === filters.experimentId);
  if (filters?.versionId)
    list = list.filter((a) => a.assignedVersionId === filters.versionId);
  return list;
}

export function getAssignedVersionId(
  userId: string,
  surface: "home" | "search" | "shop",
  context?: { region?: string; memberType?: string }
): string | null {
  const experiments = getRunningExperiments().filter(
    (e) => e.targetSurface === surface
  );
  for (const exp of experiments) {
    const existing = ASSIGNMENTS.find(
      (a) => a.userId === userId && a.experimentId === exp.id
    );
    if (existing) return existing.assignedVersionId;
    const assigned = assignUserToExperiment(userId, exp, context);
    if (assigned) return assigned.assignedVersionId;
  }
  return null;
}

export function assignUserToExperiment(
  userId: string,
  experiment: RecommendationExperiment,
  context?: { region?: string; memberType?: string }
): UserFeedAssignment | null {
  if (experiment.status !== "running") return null;
  const existing = ASSIGNMENTS.find(
    (a) => a.userId === userId && a.experimentId === experiment.id
  );
  if (existing) return existing;

  const region = context?.region ?? "";
  const memberType = context?.memberType ?? "normal";
  if (experiment.targetRegions.length && !experiment.targetRegions.includes(region))
    return null;
  if (
    experiment.targetMemberTypes.length &&
    !experiment.targetMemberTypes.includes(memberType)
  )
    return null;

  const rand = Math.random() * 100;
  const controlPct = experiment.controlPercentage;
  const variants = experiment.variantVersionIds;
  const variantPcts = experiment.variantPercentages;
  let cum = controlPct;
  if (rand < cum) {
    const a: UserFeedAssignment = {
      id: `ufa-${Date.now()}-${userId}`,
      userId,
      experimentId: experiment.id,
      assignedVersionId: experiment.controlVersionId,
      assignedGroup: "control",
      assignedAt: new Date().toISOString(),
      region,
      memberType,
    };
    ASSIGNMENTS.push(a);
    return a;
  }
  for (let i = 0; i < variants.length; i++) {
    cum += variantPcts[i] ?? 0;
    if (rand < cum) {
      const group: AssignedGroup =
        i === 0 ? "variant_a" : i === 1 ? "variant_b" : "variant_b";
      const a: UserFeedAssignment = {
        id: `ufa-${Date.now()}-${userId}`,
        userId,
        experimentId: experiment.id,
        assignedVersionId: variants[i]!,
        assignedGroup: group,
        assignedAt: new Date().toISOString(),
        region,
        memberType,
      };
      ASSIGNMENTS.push(a);
      return a;
    }
  }
  const a: UserFeedAssignment = {
    id: `ufa-${Date.now()}-${userId}`,
    userId,
    experimentId: experiment.id,
    assignedVersionId: experiment.controlVersionId,
    assignedGroup: "control",
    assignedAt: new Date().toISOString(),
    region,
    memberType,
  };
  ASSIGNMENTS.push(a);
  return a;
}
