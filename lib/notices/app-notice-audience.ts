/**
 * 앱 공지 「보는 사람」(audience) 단일 정의 — 배달 오픈 4단계 (Owner 승인 설계 2026-11-10).
 *
 * - `all`                   = 전체 회원 (고객센터 공지 · 기존 행 전부)
 * - `store_owners`          = 매장 사장님 전체 — 매장 행만 있으면 상태 무관(신청·심사·보완·승인·정지·반려)
 * - `store_owners_approved` = 승인 매장 보유 사장님만
 *
 * 회원 고객센터 조회 경로는 `APP_NOTICE_MEMBER_AUDIENCE` 만 읽는다 — 사장님 전용 공지가 회원에게 새지 않게.
 * 승인 판정은 오너 운영 게이트(`ownerStoreOperationalWriteBlock`)와 같은 함수 하나로 한다.
 */
import type { MessageKey } from "@/lib/i18n/messages";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { ownerStoreOperationalWriteBlock } from "@/lib/stores/owner-product-gate";

export const APP_NOTICE_AUDIENCES = ["all", "store_owners", "store_owners_approved"] as const;

export type AppNoticeAudience = (typeof APP_NOTICE_AUDIENCES)[number];

export type OwnerAnnouncementAudience = Exclude<AppNoticeAudience, "all">;

/** 회원(고객센터) 조회 경로가 읽는 유일한 대상 값 */
export const APP_NOTICE_MEMBER_AUDIENCE = "all" as const satisfies AppNoticeAudience;

export function isAppNoticeAudience(value: unknown): value is AppNoticeAudience {
  return value === "all" || value === "store_owners" || value === "store_owners_approved";
}

export function parseAppNoticeAudience(value: unknown, fallback: AppNoticeAudience = "all"): AppNoticeAudience {
  return isAppNoticeAudience(value) ? value : fallback;
}

export function isOwnerAnnouncementAudience(value: unknown): value is OwnerAnnouncementAudience {
  return value === "store_owners" || value === "store_owners_approved";
}

/**
 * 회원에게 보여도 되는 행인지 — 열이 없던 시절 행(undefined/null)은 `all` 로 본다(DB 기본값과 같음).
 */
export function isAppNoticeVisibleToMembers(row: { audience?: string | null } | null | undefined): boolean {
  const a = row?.audience;
  return a == null || a === APP_NOTICE_MEMBER_AUDIENCE;
}

/** 어드민 「보는 사람」 라벨 키 */
export const APP_NOTICE_AUDIENCE_LABEL_KEY: Record<AppNoticeAudience, MessageKey> = {
  all: "admin_app_notice_audience_all",
  store_owners: "admin_app_notice_audience_store_owners",
  store_owners_approved: "admin_app_notice_audience_store_owners_approved",
};

/**
 * 로그인 사용자의 매장 승인 상태 목록 → 볼 수 있는 사장님 공지 대상.
 * 매장이 하나도 없으면 빈 배열(사장님 아님).
 */
export function ownerAnnouncementAudiencesForStores(
  approvalStatuses: readonly (string | null | undefined)[]
): OwnerAnnouncementAudience[] {
  if (approvalStatuses.length === 0) return [];
  const out: OwnerAnnouncementAudience[] = ["store_owners"];
  if (approvalStatuses.some((s) => ownerStoreOperationalWriteBlock(s) === null)) {
    out.push("store_owners_approved");
  }
  return out;
}

/** 사장님 운영 공지 상세 경로 (알림 링크 · 목록 · 허브 카드 공통) — URL 단일 정의는 `OwnerRoutes`. */
export function buildOwnerAnnouncementDetailPath(noticeId: string, storeId?: string | null): string {
  return OwnerRoutes.announcementDetail(noticeId, storeId);
}
