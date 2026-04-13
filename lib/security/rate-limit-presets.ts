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

export async function enforceTradeChatSendQuota(userId: string, roomId: string) {
  return enforceRateLimit({
    key: `chat_send:${roomId}:${userId}`,
    limit: 90,
    windowMs: 60_000,
    message: TOO_MANY,
    code: "chat_send_rate_limited",
  });
}
