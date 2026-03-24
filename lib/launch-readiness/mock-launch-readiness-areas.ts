/**
 * 46단계: 영역별 readiness mock (ready 비율 기반 score)
 */

import { getLaunchReadinessItems } from "./mock-launch-readiness-items";
import { getLaunchReadinessAreas } from "./mock-launch-checklist-templates";
import type {
  LaunchReadinessAreasEntry,
  LaunchReadinessArea,
  LaunchReadinessStatus,
} from "@/lib/types/launch-readiness";

export function getLaunchReadinessAreasList(
  phase?: "pre_launch" | "launch_day" | "post_launch"
): LaunchReadinessAreasEntry[] {
  const areas = getLaunchReadinessAreas();
  const items = getLaunchReadinessItems(
    phase ? { phase } : undefined
  );

  return areas.map((area) => {
    const areaItems = items.filter((i) => i.area === area);
    const totalItems = areaItems.length;
    const readyItems = areaItems.filter((i) => i.status === "ready").length;
    const blockedItems = areaItems.filter((i) => i.status === "blocked").length;
    const score =
      totalItems > 0 ? Math.round((readyItems / totalItems) * 100) : 0;

    let status: LaunchReadinessStatus = "not_ready";
    if (blockedItems > 0) status = "blocked";
    else if (readyItems === totalItems && totalItems > 0) status = "ready";
    else if (readyItems > 0) status = "in_progress";

    const owner = areaItems.find((i) => i.ownerAdminNickname);
    return {
      id: `lra-${area}`,
      area,
      status,
      totalItems,
      readyItems,
      blockedItems,
      score,
      ownerAdminId: owner?.ownerAdminId ?? null,
      ownerAdminNickname: owner?.ownerAdminNickname ?? null,
      note: "",
    };
  });
}
