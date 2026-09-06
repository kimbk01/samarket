import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdsOpsStatus } from "@/lib/admin/ads-exposure/ops-status";
import { loadPlatformPopupCandidates } from "@/lib/platform-popup/load-popup-candidates";
import {
  isPlatformPopupAdvertisingSurface,
  resolveDibaySurface,
} from "@/lib/platform-popup/resolve-dibay-surface";
import { resolvePopupAd } from "@/lib/platform-popup/resolve-popup-ad";
import {
  PLATFORM_POPUP_CONSUMER_SURFACES,
  type PlatformPopupConsumerSurface,
} from "@/lib/platform-popup/types";

export type PopupRuntimeDisplayStatus =
  | "live_now"
  | "eligible_waiting"
  | "scheduled"
  | "paused"
  | "ended"
  | "pending"
  | "draft"
  | "rejected";

const SURFACE_PATHNAME: Record<PlatformPopupConsumerSurface, string> = {
  COMMUNITY: "/philife",
  TRADE: "/market",
  DELIVERY: "/stores",
  DELIVERY_OWNER: "/stores/owner",
  ADMIN: "/admin",
  MYPAGE: "/mypage",
};

export async function computePopupWinnerIdsBySurface(
  sb: SupabaseClient
): Promise<Set<string>> {
  const candidates = await loadPlatformPopupCandidates(sb, {});
  const winnerIds = new Set<string>();
  const now = new Date();

  for (const expectedSurface of PLATFORM_POPUP_CONSUMER_SURFACES) {
    const pathname = SURFACE_PATHNAME[expectedSurface];
    const resolvedSurface = resolveDibaySurface(pathname);
    if (!isPlatformPopupAdvertisingSurface(resolvedSurface)) continue;
    const result = resolvePopupAd({
      pathname,
      resolvedSurface,
      now,
      candidates,
    });
    if (result.ok && result.winner) winnerIds.add(result.winner.campaignId);
  }
  return winnerIds;
}

export function projectPopupRuntimeDisplay(input: {
  opsStatus: AdsOpsStatus;
  campaignId: string;
  winnerIds: ReadonlySet<string>;
  startAt?: string | null;
  endAt?: string | null;
}): {
  status: PopupRuntimeDisplayStatus;
  isRuntimeWinner: boolean;
} {
  const isRuntimeWinner = input.winnerIds.has(input.campaignId);
  switch (input.opsStatus) {
    case "live":
      return {
        status: isRuntimeWinner ? "live_now" : "eligible_waiting",
        isRuntimeWinner,
      };
    case "scheduled":
      return { status: "scheduled", isRuntimeWinner: false };
    case "paused":
      return { status: "paused", isRuntimeWinner: false };
    case "rejected":
      return { status: "rejected", isRuntimeWinner: false };
    case "draft":
      return { status: "draft", isRuntimeWinner: false };
    case "pending":
      return { status: "pending", isRuntimeWinner: false };
    case "ended":
    case "archived":
    default:
      return { status: "ended", isRuntimeWinner: false };
  }
}

export function popupRuntimeDisplayLabel(
  status: PopupRuntimeDisplayStatus,
  ko: boolean
): string {
  const labels: Record<PopupRuntimeDisplayStatus, { ko: string; en: string }> = {
    live_now: { ko: "현재 노출 중", en: "Live now" },
    eligible_waiting: { ko: "노출 대기", en: "Eligible · waiting" },
    scheduled: { ko: "예약", en: "Scheduled" },
    paused: { ko: "일시중지", en: "Paused" },
    ended: { ko: "종료", en: "Ended" },
    pending: { ko: "승인 대기", en: "Pending" },
    draft: { ko: "작성 중", en: "Draft" },
    rejected: { ko: "반려", en: "Rejected" },
  };
  return ko ? labels[status].ko : labels[status].en;
}
