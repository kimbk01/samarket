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
