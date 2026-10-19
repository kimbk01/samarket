/**
 * Canonical Event publication / availability evaluator.
 * Admin list, Event Detail, future distribution must share this.
 */

import type { PlatformEventStatus } from "@/lib/platform-events/types";

export type PlatformEventAvailability =
  | "active"
  | "draft"
  | "scheduled"
  | "ended"
  | "unpublished"
  | "archived"
  | "missing";

export type PlatformEventPublicationInput = {
  status?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  /** Board archive (migration 20270518120000). Absent on pre-migration rows. */
  archivedAt?: string | null;
};

export function resolvePlatformEventAvailability(
  row: PlatformEventPublicationInput | null | undefined,
  nowMs: number = Date.now()
): PlatformEventAvailability {
  if (!row) return "missing";
  if (row.archivedAt) return "archived";
  const status = String(row.status ?? "").trim().toLowerCase() as PlatformEventStatus | string;
  if (status === "draft") return "draft";
  if (status === "unpublished") return "unpublished";
  if (status !== "published") return "unpublished";

  if (row.startsAt) {
    const t = Date.parse(String(row.startsAt));
    if (Number.isFinite(t) && t > nowMs) return "scheduled";
  }
  if (row.endsAt) {
    const t = Date.parse(String(row.endsAt));
    if (Number.isFinite(t) && t < nowMs) return "ended";
  }
  return "active";
}

/** Member/public may render full Event Detail. */
export function isPlatformEventPubliclyAvailable(
  row: PlatformEventPublicationInput | null | undefined,
  nowMs?: number
): boolean {
  return resolvePlatformEventAvailability(row, nowMs) === "active";
}

export function platformEventUnavailableFallback(
  availability: PlatformEventAvailability,
  language: "ko" | "en" = "ko"
): { title: string; body: string } {
  if (language === "en") {
    switch (availability) {
      case "scheduled":
        return { title: "Coming soon", body: "This event has not started yet." };
      case "ended":
        return { title: "Event ended", body: "This event has ended." };
      case "draft":
      case "unpublished":
      case "archived":
        return { title: "Content unavailable", body: "This event is not available." };
      case "missing":
      default:
        return { title: "Not found", body: "We could not find this event." };
    }
  }
  switch (availability) {
    case "scheduled":
      return { title: "곧 시작", body: "이 이벤트는 아직 시작되지 않았습니다." };
    case "ended":
      return { title: "종료된 이벤트", body: "이 이벤트는 종료되었습니다." };
    case "draft":
    case "unpublished":
    case "archived":
      return { title: "볼 수 없는 콘텐츠", body: "이 이벤트는 현재 볼 수 없습니다." };
    case "missing":
    default:
      return { title: "찾을 수 없음", body: "이벤트를 찾을 수 없습니다." };
  }
}

/**
 * EVT-02 — public Event Detail view decision (single contract for API + page).
 * - active / ended  → viewable (ended shows 「종료된 이벤트입니다」 band, CTA disabled). Never 410.
 * - missing / scheduled (not started) → standard 404 notice (do not reveal upcoming events).
 * - draft / unpublished / archived    → standard 「볼 수 없는 콘텐츠」 notice (403).
 */
export type PlatformEventPublicView =
  | { kind: "view"; ended: boolean; availability: "active" | "ended" }
  | { kind: "not_found"; httpStatus: 404; availability: "missing" }
  | { kind: "forbidden"; httpStatus: 403; availability: "unpublished" };

export function resolvePlatformEventPublicView(
  row: PlatformEventPublicationInput | null | undefined,
  nowMs: number = Date.now()
): PlatformEventPublicView {
  const a = resolvePlatformEventAvailability(row, nowMs);
  if (a === "active") return { kind: "view", ended: false, availability: "active" };
  if (a === "ended") return { kind: "view", ended: true, availability: "ended" };
  if (a === "missing" || a === "scheduled") {
    return { kind: "not_found", httpStatus: 404, availability: "missing" };
  }
  return { kind: "forbidden", httpStatus: 403, availability: "unpublished" };
}
