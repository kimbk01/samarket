/**
 * 46단계: 런칭 readiness 요약 mock (must_have blocked → no_go)
 */

import { getLaunchReadinessItems } from "./mock-launch-readiness-items";
import type {
  LaunchReadinessSummary,
  GoLiveRecommendation,
  LaunchReadinessArea,
} from "@/lib/types/launch-readiness";

export function getLaunchReadinessSummary(
  phase?: "pre_launch" | "launch_day" | "post_launch"
): LaunchReadinessSummary {
  const items = getLaunchReadinessItems(
    phase ? { phase } : undefined
  );
  const mustHave = items.filter((i) => i.gateType === "must_have");
  const shouldHave = items.filter((i) => i.gateType === "should_have");
  const optional = items.filter((i) => i.gateType === "optional");

  const mustHaveReady = mustHave.filter((i) => i.status === "ready").length;
  const mustHaveTotal = mustHave.length;
  const shouldHaveReady = shouldHave.filter((i) => i.status === "ready").length;
  const shouldHaveTotal = shouldHave.length;
  const optionalReady = optional.filter((i) => i.status === "ready").length;
  const optionalTotal = optional.length;

  const blockedCount = items.filter((i) => i.status === "blocked").length;
  const hasBlockedMustHave = mustHave.some((i) => i.status === "blocked");
  const allMustHaveReady = mustHaveTotal > 0 && mustHaveReady === mustHaveTotal;
  const someShouldHaveMissing =
    shouldHaveTotal > 0 && shouldHaveReady < shouldHaveTotal;

  let goLiveRecommendation: GoLiveRecommendation = "no_go";
  if (hasBlockedMustHave) goLiveRecommendation = "no_go";
  else if (allMustHaveReady && someShouldHaveMissing) goLiveRecommendation = "conditional_go";
  else if (allMustHaveReady && !someShouldHaveMissing) goLiveRecommendation = "go";

  const areas = [...new Set(items.map((i) => i.area))] as LaunchReadinessArea[];
  const readyAreas = areas.filter((area) =>
    items
      .filter((i) => i.area === area && i.gateType === "must_have")
      .every((i) => i.status === "ready")
  );
  const notReadyAreas = areas.filter(
    (area) => !readyAreas.includes(area)
  );

  const totalItems = items.length;
  const readyItems = items.filter((i) => i.status === "ready").length;
  const overallScore =
    totalItems > 0 ? Math.round((readyItems / totalItems) * 100) : 0;

  const latestUpdatedAt =
    items.length > 0
      ? items.reduce(
          (max, i) => (i.updatedAt > max ? i.updatedAt : max),
          items[0].updatedAt
        )
      : null;

  return {
    overallScore,
    mustHaveTotal,
    mustHaveReady,
    shouldHaveTotal,
    shouldHaveReady,
    optionalTotal,
    optionalReady,
    blockedCount,
    readyAreas,
    notReadyAreas,
    goLiveRecommendation,
    latestUpdatedAt,
  };
}
