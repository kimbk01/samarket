/**
 * 52단계: 스프린트 요약 mock (velocity placeholder)
 */

import type { DevSprintSummary } from "@/lib/types/dev-sprints";
import { getDevSprints } from "./mock-dev-sprints";
import { getDevSprintItems } from "./mock-dev-sprint-items";
import { getReleaseNotes } from "./mock-release-notes";

export function getDevSprintSummary(): DevSprintSummary {
  const sprints = getDevSprints();
  const items = getDevSprintItems();
  const notes = getReleaseNotes({ status: "published" });

  const activeSprints = sprints.filter((s) => s.status === "active").length;
  const completedItems = items.filter((i) => i.status === "done").length;
  const blockedItems = items.filter((i) => i.status === "blocked").length;

  const latestRelease = notes.sort(
    (a, b) =>
      new Date((b.releaseDate || b.updatedAt) ?? 0).getTime() -
      new Date((a.releaseDate || a.updatedAt) ?? 0).getTime()
  )[0];

  const allUpdated = [
    ...sprints.map((s) => s.updatedAt),
    ...items.map((i) => i.updatedAt),
  ];
  const latestUpdatedAt =
    allUpdated.length > 0
      ? allUpdated.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
      : new Date().toISOString();

  return {
    totalSprints: sprints.length,
    activeSprints,
    totalItems: items.length,
    completedItems,
    blockedItems,
    averageVelocity: 4.5, // placeholder
    latestReleaseVersion: latestRelease?.releaseVersion ?? null,
    latestUpdatedAt,
  };
}
