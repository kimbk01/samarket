import { createHash } from "node:crypto";
import { enforceRateLimit } from "@/lib/http/api-route";

const TOO_MANY = "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";

type ReportQuotaOptions = { limit?: number };

/** 피드·모임·통합 신고 등 — 사용자당 시간당 (기본 40, 채팅 신고 등은 `limit` 로 조정) */
export async function enforceUserReportQuota(
  userId: string,
  channel: string,
  options?: ReportQuotaOptions
) {
  return enforceRateLimit({
    key: `report:${channel}:${userId}`,
    limit: options?.limit ?? 40,
    windowMs: 3_600_000,
    message: "신고 접수 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.",
    code: "report_rate_limited",
  });
}

/**
 * ORD-C-16 — `/api/stores/[slug]/delivery-eta` (유료 Google Routes 호출 경로) 사용자당 분당 상한.
 * 호출처는 매장 상세 요약·장바구니 ETA 프리뷰(주소 단위 single-flight)뿐이라 정상 탐색은 이 상한 아래.
 */
export async function enforceDeliveryEtaQuota(userId: string) {
  return enforceRateLimit({
    key: `delivery_eta:${userId}`,
    limit: 60,
    windowMs: 60_000,
    message: TOO_MANY,
    code: "delivery_eta_rate_limited",
  });
}

export async function enforceFavoriteToggleQuota(userId: string) {
  return enforceRateLimit({
    key: `favorites_toggle:${userId}`,
    limit: 200,
    windowMs: 60_000,
    message: TOO_MANY,
    code: "favorite_rate_limited",
  });
}

export async function enforcePhoneVerificationPatchQuota(userId: string) {
  return enforceRateLimit({
    key: `phone_verification_patch:${userId}`,
    limit: 10,
    windowMs: 3_600_000,
    message: "연락처 인증 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
    code: "phone_verification_rate_limited",
  });
}

/** 약관·연령 동의 제출 — 생년월일 정정 재입력은 허용, 반복 자동 제출만 막는다. */
export async function enforceLegalConsentSubmitQuota(userId: string) {
  return enforceRateLimit({
    key: `legal_consent_submit:${userId}`,
    limit: 20,
    windowMs: 600_000,
    message: TOO_MANY,
    code: "legal_consent_rate_limited",
  });
}

export async function enforcePhoneVerificationSendQuota(userId: string) {
  return enforceRateLimit({
    key: `phone_verification_send:${userId}`,
    limit: 8,
    windowMs: 3_600_000,
    message: "인증번호 발송 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    code: "phone_verification_send_rate_limited",
  });
}

export async function enforcePhoneVerificationCheckQuota(userId: string) {
  return enforceRateLimit({
    key: `phone_verification_check:${userId}`,
    limit: 20,
    windowMs: 3_600_000,
    message: "인증번호 확인 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    code: "phone_verification_check_rate_limited",
  });
}

export async function enforcePasswordLoginResolveQuota(subjectKey: string) {
  return enforceRateLimit({
    key: `password_login_resolve:${subjectKey}`,
    limit: 30,
    windowMs: 60_000,
    message: "로그인 식별자 확인 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    code: "password_login_resolve_rate_limited",
  });
}

export async function enforceProfileEnsureQuota(userId: string) {
  return enforceRateLimit({
    key: `profile_ensure:${userId}`,
    limit: 40,
    windowMs: 60_000,
    message: TOO_MANY,
    code: "profile_ensure_rate_limited",
  });
}

export async function enforceImageUploadQuota(userId: string, scope: string) {
  return enforceRateLimit({
    key: `upload_img:${scope}:${userId}`,
    limit: 45,
    windowMs: 60_000,
    message: "업로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    code: "upload_rate_limited",
  });
}

export async function enforceStoreOwnerImageUploadQuota(userId: string, storeId: string) {
  return enforceRateLimit({
    key: `upload_store_img:${storeId}:${userId}`,
    limit: 35,
    windowMs: 60_000,
    message: TOO_MANY,
    code: "upload_rate_limited",
  });
}

export async function enforceTradeChatCreateRoomQuota(userId: string) {
  return enforceRateLimit({
    key: `chat_create_room:${userId}`,
    limit: 25,
    windowMs: 60_000,
    message: TOO_MANY,
    code: "chat_create_rate_limited",
  });
}

/**
 * 거래 C-3 (2026-10-28) — 거래 채팅 **새 방 생성**만 센다(기존 방 재진입·미리 불러오기는 세지 않음).
 * `item/start`·`entry/resolve`·`create-room` 이 공유하는 `runItemTradeChatStartCore` 의 새 방 insert 직전에서 호출.
 */
export async function enforceTradeChatNewRoomQuota(userId: string) {
  return enforceRateLimit({
    key: `trade_chat_new_room:${userId}`,
    limit: 25,
    windowMs: 60_000,
    message: TOO_MANY,
    code: "trade_chat_new_room_rate_limited",
  });
}

export async function enforceTradeChatSendQuota(userId: string, roomId: string) {
  return enforceRateLimit({
    key: `chat_send:${roomId}:${userId}`,
    limit: 90,
    windowMs: 60_000,
    message: TOO_MANY,
    code: "chat_send_rate_limited",
  });
}

/**
 * v4 W1 API-08 — 배달 광고 클릭 기록(`/api/stores/ads/click`, 비로그인 허용).
 * 로그인 = user, 비로그인 = IP 기준 (`getRateLimitKey`). 정상 탐색(카드 탭)은 분당 60회 아래.
 */
export async function enforceDeliveryAdClickQuota(rateLimitSubject: string) {
  return enforceRateLimit({
    key: `delivery_ad_click:${rateLimitSubject}`,
    limit: 60,
    windowMs: 60_000,
    message: TOO_MANY,
    code: "delivery_ad_click_rate_limited",
  });
}

/**
 * v4 W1 API-13 — 매장 리뷰 작성(`POST /api/me/store-reviews`). 주문당 1건 제약은 DB 가 갖고,
 * 이 상한은 반복 요청(스팸·자동화)만 막는다.
 */
export async function enforceStoreReviewCreateQuota(userId: string) {
  return enforceRateLimit({
    key: `store_review_create:${userId}`,
    limit: 20,
    windowMs: 3_600_000,
    message: TOO_MANY,
    code: "store_review_rate_limited",
  });
}

/**
 * v4 W1 API-13 — 배달 주문 생성(`POST /api/me/store-orders`). 정상 주문 흐름(재시도 포함)은 분당 10회 아래.
 */
export async function enforceStoreOrderCreateQuota(userId: string) {
  return enforceRateLimit({
    key: `store_order_create:${userId}`,
    limit: 10,
    windowMs: 60_000,
    message: TOO_MANY,
    code: "store_order_create_rate_limited",
  });
}

/** 운영자 알림 「내 폰으로 테스트」 — 관리자당 분당 10회 (확정 설계 B-18). */
export async function enforceAdminCampaignTestSendQuota(adminUserId: string) {
  return enforceRateLimit({
    key: `admin_campaign_test_send:${adminUserId}`,
    limit: 10,
    windowMs: 60_000,
    message: "테스트 발송이 너무 잦습니다. 1분 뒤 다시 시도해 주세요.",
    code: "test_send_rate_limited",
  });
}

/**
 * D-21 ③ (Owner 「설계안대로」 2026-11-04) — 광고 기록 API 4개(팝업 이벤트·팝업 숨김·피드 배너 이벤트·배달 배너 노출) 요청 제한.
 * 키 = 로그인 회원 id, 없으면 접속 IP 해시(원문 IP 를 키에 남기지 않음). 한도는 정상 사용의 몇 배(1분 120회).
 * 넘으면 429 — 클라이언트는 기록 실패를 무시하므로 화면 동작에는 영향이 없다. Redis 가 없으면 공용 함수의 인메모리 동작.
 */
export type AdEventRecordRoute =
  | "platform_popup_events"
  | "platform_popup_suppress"
  | "feed_ad_events"
  | "delivery_ad_impression";

export const AD_EVENT_RECORD_QUOTA = { limit: 120, windowMs: 60_000 } as const;

/** 회원 id → `u:<id>` · 비로그인 → `iph:<sha256(ip) 앞 32자>` · IP 도 모르면 `iph:unknown` */
export function adEventRecordActorKey(input: { userId?: string | null; ip?: string | null }): string {
  const uid = String(input.userId ?? "").trim();
  if (uid) return `u:${uid}`;
  const ip = String(input.ip ?? "").trim();
  if (!ip || ip === "unknown") return "iph:unknown";
  return `iph:${createHash("sha256").update(ip, "utf8").digest("hex").slice(0, 32)}`;
}

export async function enforceAdEventRecordQuota(route: AdEventRecordRoute, actorKey: string) {
  return enforceRateLimit({
    key: `ad_event_record:${route}:${actorKey}`,
    limit: AD_EVENT_RECORD_QUOTA.limit,
    windowMs: AD_EVENT_RECORD_QUOTA.windowMs,
    message: TOO_MANY,
    code: "ad_event_rate_limited",
  });
}

/**
 * D-21 ④ — 팝업 이벤트 중복 거르기: 같은 보는 사람 · 소재 · 종류는 10분에 1번만 저장한다(피드와 같은 방식).
 * @returns true = 저장해도 됨 · false = 이미 10분 안에 저장됨(저장 생략)
 */
export const PLATFORM_POPUP_EVENT_DEDUPE_WINDOW_MS = 600_000;

export async function claimPlatformPopupEventDedupe(input: {
  viewerKey: string;
  campaignId: string;
  creativeId: string | null;
  eventType: string;
}): Promise<boolean> {
  const r = await enforceRateLimit({
    key: `platform_popup_event_once:${input.viewerKey}:${input.campaignId}:${input.creativeId ?? "-"}:${input.eventType}`,
    limit: 1,
    windowMs: PLATFORM_POPUP_EVENT_DEDUPE_WINDOW_MS,
  });
  return r.ok;
}
