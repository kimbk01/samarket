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
import { catalogPair } from "@/lib/i18n/catalog-pair";

export type PopupRuntimeDisplayStatus =
  | "live_now"
  | "eligible_waiting"
  | "scheduled"
  | "paused"
  | "ended"
  | "pending"
  | "draft"
  | "rejected"
  | "incomplete";

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
  const { winnerIds } = await computePopupWinnerOccupancy(sb);
  return winnerIds;
}

export type PopupWinnerOccupant = {
  campaignId: string;
  surface: PlatformPopupConsumerSurface;
};

export async function computePopupWinnerOccupancy(
  sb: SupabaseClient
): Promise<{ winnerIds: Set<string>; occupants: PopupWinnerOccupant[] }> {
  const candidates = await loadPlatformPopupCandidates(sb, {});
  const winnerIds = new Set<string>();
  const occupants: PopupWinnerOccupant[] = [];
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
    if (result.ok && result.winner) {
      winnerIds.add(result.winner.campaignId);
      occupants.push({
        campaignId: result.winner.campaignId,
        surface: result.winner.surface,
      });
    }
  }
  return { winnerIds, occupants };
}

export function projectPopupRuntimeDisplay(input: {
  opsStatus: AdsOpsStatus;
  campaignId: string;
  winnerIds: ReadonlySet<string>;
  startAt?: string | null;
  endAt?: string | null;
  completeness?: "orphan_partial" | "incomplete" | "draft_ready" | "pending_review" | "operating" | null;
}): {
  status: PopupRuntimeDisplayStatus;
  isRuntimeWinner: boolean;
} {
  const isRuntimeWinner = input.winnerIds.has(input.campaignId);
  if (
    input.completeness === "orphan_partial" ||
    input.completeness === "incomplete"
  ) {
    return { status: "incomplete", isRuntimeWinner: false };
  }
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
      return {
        status: input.completeness === "draft_ready" ? "draft" : "incomplete",
        isRuntimeWinner: false,
      };
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
    live_now: catalogPair("admin_live_now"),
    eligible_waiting: catalogPair("admin_eligible_waiting"),
    scheduled: catalogPair("admin_scheduled"),
    paused: catalogPair("admin_launch_intro_state_paused"),
    ended: catalogPair("admin_ended"),
    pending: catalogPair("admin_pending_2"),
    draft: catalogPair("admin_saved_draft"),
    rejected: catalogPair("admin_rejected"),
    incomplete: catalogPair("admin_incomplete"),
  };
  return ko ? labels[status].ko : labels[status].en;
}
