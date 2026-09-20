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
  | "missing";

export type PlatformEventPublicationInput = {
  status?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
};

export function resolvePlatformEventAvailability(
  row: PlatformEventPublicationInput | null | undefined,
  nowMs: number = Date.now()
): PlatformEventAvailability {
  if (!row) return "missing";
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
        return { title: "Unavailable", body: "This event is not available." };
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
      return { title: "이용 불가", body: "이 이벤트는 현재 볼 수 없습니다." };
    case "missing":
    default:
      return { title: "찾을 수 없음", body: "이벤트를 찾을 수 없습니다." };
  }
}
