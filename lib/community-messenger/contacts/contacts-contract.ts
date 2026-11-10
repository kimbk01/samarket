/**
 * 메신저 연락처 동기화 — 앱·서버 공통 계약 (SSOT `docs/design/messenger-contacts-sync-plan.md` v5 §6·§7·§8).
 * 서버 전용 모듈을 가져오지 않는다 (2단계 앱 화면·네이티브 연결이 그대로 쓴다).
 * 서버 응답은 오류 코드만 보낸다 — 화면 문구는 앱이 `t()` 키로 만든다 (docs/i18n-ssot.md).
 */
import { parseKoreaMobileLocal, resolveVerifyPhone, type VerifyPhoneCountry } from "@/lib/phone/verify-phone-number";

export const CONTACTS_API_BASE = "/api/community-messenger/contacts";

/** 한 요청에 올릴 수 있는 번호 수 상한 (어드민 설정이 더 낮으면 그 값) */
export const CONTACTS_MAX_NUMBERS_PER_REQUEST = 1000;
/** 스냅숏 조각 수 상한 (1,000 × 100 = 10만 번호) */
export const CONTACTS_MAX_SNAPSHOT_CHUNKS = 100;
export const CONTACTS_CLIENT_REF_MAX = 128;

export const CONTACTS_DISCOVERY_POLICIES = ["everyone", "mutual", "nobody"] as const;
export type ContactsDiscoveryPolicy = (typeof CONTACTS_DISCOVERY_POLICIES)[number];
export const CONTACTS_CALL_DEFAULTS = ["ask", "dibay", "phone"] as const;
export type ContactsCallDefault = (typeof CONTACTS_CALL_DEFAULTS)[number];
export const CONTACTS_PERMISSION_STATES = ["granted", "limited", "denied", "unknown"] as const;
export type ContactsPermissionState = (typeof CONTACTS_PERMISSION_STATES)[number];
export const CONTACTS_PLATFORMS = ["android", "ios"] as const;
export type ContactsPlatform = (typeof CONTACTS_PLATFORMS)[number];

/** 서버 오류 코드 → HTTP 상태 (§7) */
export const CONTACTS_ERROR_STATUS = {
  contacts_disabled: 503,
  contacts_unconfigured: 503,
  supabase_unconfigured: 503,
  bad_request: 400,
  bad_hash: 400,
  invalid_phone: 400,
  invalid_install_id: 400,
  too_many: 429,
  consent_required: 403,
  source_mismatch: 403,
  not_found: 404,
  profile_not_found: 404,
  resync_required: 409,
  snapshot_in_progress: 409,
  snapshot_generation_mismatch: 409,
  source_inactive: 410,
  device_sync_off: 410,
  permission_denied: 410,
  account_sync_off: 410,
  resync_limit: 429,
  daily_limit: 429,
  internal_error: 500,
} as const;
export type ContactsErrorCode = keyof typeof CONTACTS_ERROR_STATUS;

export function contactsErrorStatus(code: string): number {
  return (CONTACTS_ERROR_STATUS as Record<string, number>)[code] ?? 500;
}

/** 필리핀 날짜 (YYYY-MM-DD) — 연락처 하루 단위 판정 단일 정의 (서버 SQL 의 `Asia/Manila` 날짜와 같음) */
export function contactsManilaDay(now = Date.now()): string {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}

/** 기기 목록 조회 때 이 기기 설치 식별자를 싣는 머리글 (주소 쿼리 금지 — 접속 기록에 남음) */
export const CONTACTS_INSTALL_ID_HEADER = "x-contacts-install-id";

/** 설치 식별자 (`ensureClientInstanceId()` 값) 형식 */
export function isValidContactsInstallId(raw: unknown): raw is string {
  return typeof raw === "string" && /^[A-Za-z0-9._:-]{8,128}$/.test(raw.trim());
}

/**
 * 기기 연락처 번호 → E.164 (+63 휴대폰 · +82 휴대폰만). 다른 나라·유선·형식 불가 번호는 null.
 * `defaultCountry` = 내 인증 번호의 나라 — 국가번호 없이 저장된 번호를 그 나라 번호로 본다 (§4 S4).
 */
export function normalizeContactPhoneE164(raw: unknown, defaultCountry: VerifyPhoneCountry): string | null {
  if (typeof raw !== "string") return null;
  const compact = raw.replace(/[\s().-]/g, "").trim();
  if (!compact) return null;
  if (compact.startsWith("+")) {
    if (!compact.startsWith("+63") && !compact.startsWith("+82")) return null;
    return resolveVerifyPhone(compact)?.e164 ?? null;
  }
  if (compact.startsWith("00")) return normalizeContactPhoneE164(`+${compact.slice(2)}`, defaultCountry);
  if (defaultCountry === "KR") {
    const local = parseKoreaMobileLocal(compact);
    return local ? `+82${local.slice(1)}` : null;
  }
  if (/^82\d{9,10}$/.test(compact)) return resolveVerifyPhone(`+${compact}`)?.e164 ?? null;
  const resolved = resolveVerifyPhone(compact);
  return resolved?.country === "PH" ? resolved.e164 : null;
}

/** 서버가 받는 번호는 이미 정규화된 E.164 여야 한다 (기기가 정규화, 서버는 재확인) */
export function isAcceptedContactE164(raw: unknown): raw is string {
  return typeof raw === "string" && (/^\+639\d{9}$/.test(raw) || /^\+821[016789]\d{7,8}$/.test(raw));
}

export type ContactsSyncAddItem = { e164: string; ref: string };

export type ContactsSyncRequest = {
  installId: string;
  sourceId: string;
  batchId: string;
  kind: "delta" | "snapshot_chunk";
  baseVersion?: number | null;
  add?: ContactsSyncAddItem[];
  remove?: string[];
  generation?: number | null;
  chunkIndex?: number | null;
  chunkTotal?: number | null;
};

export type ContactsSyncRequestParse =
  | { ok: true; value: Required<Pick<ContactsSyncRequest, "installId" | "sourceId" | "batchId" | "kind">> & {
      baseVersion: number | null;
      add: ContactsSyncAddItem[];
      remove: string[];
      generation: number | null;
      chunkIndex: number | null;
      chunkTotal: number | null;
    } }
  | { ok: false; error: ContactsErrorCode };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(raw: unknown): raw is string {
  return typeof raw === "string" && UUID_RE.test(raw);
}

function optInt(v: unknown): number | null | undefined {
  if (v === undefined || v === null) return null;
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : undefined;
}

/** POST /sync 본문 검증 — 번호는 E.164 만, 중복 번호는 1개로 */
export function parseContactsSyncRequest(body: unknown, maxNumbers = CONTACTS_MAX_NUMBERS_PER_REQUEST): ContactsSyncRequestParse {
  if (!body || typeof body !== "object") return { ok: false, error: "bad_request" };
  const b = body as Record<string, unknown>;
  if (!isValidContactsInstallId(b.installId)) return { ok: false, error: "invalid_install_id" };
  if (!isUuid(b.sourceId)) return { ok: false, error: "bad_request" };
  if (typeof b.batchId !== "string" || !/^[A-Za-z0-9._:-]{8,80}$/.test(b.batchId)) return { ok: false, error: "bad_request" };
  if (b.kind !== "delta" && b.kind !== "snapshot_chunk") return { ok: false, error: "bad_request" };
  const baseVersion = optInt(b.baseVersion);
  const generation = optInt(b.generation);
  const chunkIndex = optInt(b.chunkIndex);
  const chunkTotal = optInt(b.chunkTotal);
  if (baseVersion === undefined || generation === undefined || chunkIndex === undefined || chunkTotal === undefined) {
    return { ok: false, error: "bad_request" };
  }
  if (b.kind === "delta" && baseVersion === null) return { ok: false, error: "bad_request" };
  if (b.kind === "snapshot_chunk") {
    if (chunkIndex === null || chunkTotal === null || chunkTotal < 1 || chunkTotal > CONTACTS_MAX_SNAPSHOT_CHUNKS || chunkIndex >= chunkTotal) {
      return { ok: false, error: "bad_request" };
    }
    if (Array.isArray(b.remove) && b.remove.length > 0) return { ok: false, error: "bad_request" };
  }
  const addRaw = b.add === undefined ? [] : b.add;
  const removeRaw = b.remove === undefined ? [] : b.remove;
  if (!Array.isArray(addRaw) || !Array.isArray(removeRaw)) return { ok: false, error: "bad_request" };
  if (addRaw.length + removeRaw.length > maxNumbers) return { ok: false, error: "too_many" };

  const add = new Map<string, ContactsSyncAddItem>();
  for (const item of addRaw) {
    if (!item || typeof item !== "object") return { ok: false, error: "bad_request" };
    const { e164, ref } = item as Record<string, unknown>;
    if (!isAcceptedContactE164(e164)) return { ok: false, error: "invalid_phone" };
    if (typeof ref !== "string" || ref.length < 1 || ref.length > CONTACTS_CLIENT_REF_MAX) return { ok: false, error: "bad_request" };
    add.set(e164, { e164, ref });
  }
  const remove = new Set<string>();
  for (const e164 of removeRaw) {
    if (!isAcceptedContactE164(e164)) return { ok: false, error: "invalid_phone" };
    remove.add(e164);
  }
  return {
    ok: true,
    value: {
      installId: (b.installId as string).trim(),
      sourceId: b.sourceId,
      batchId: b.batchId,
      kind: b.kind,
      baseVersion,
      add: [...add.values()],
      remove: [...remove],
      generation,
      chunkIndex,
      chunkTotal,
    },
  };
}

/** 목록 응답 행 */
export type ContactsMemberRow = {
  user_id: string;
  nickname: string | null;
  username: string | null;
  dibay_id: string | null;
  avatar_url: string | null;
  on_this_device: boolean;
  client_ref: string | null;
  recently_joined: boolean;
  request_state: "none" | "sent" | "received";
};

/** 연락처 화면 주소 (메신저 하위) */
/** 연락처 화면·설정 주소 (경로) — 1단 머리글 규칙·분할 판정이 쓰는 값 */
export const MESSENGER_CONTACTS_SCREEN_PATH = "/community-messenger/contacts";
export const MESSENGER_CONTACTS_SETTINGS_PATH = "/community-messenger/contacts/settings";
/**
 * 이동 주소 — 분할 화면(≥768)에서 왼쪽 칸이 친구 탭을 유지하도록 `section=friends` 를 함께 보낸다
 * (왼쪽 칸 `MessengerSplitListPane` 이 `section` 으로 탭을 고름).
 */
export const MESSENGER_CONTACTS_SCREEN_HREF = `${MESSENGER_CONTACTS_SCREEN_PATH}?section=friends`;
export const MESSENGER_CONTACTS_SETTINGS_HREF = `${MESSENGER_CONTACTS_SETTINGS_PATH}?section=friends`;
/** 숨긴 추천 바로가기 (관리 「숨긴 추천」 줄 · 시안 hidden) — 설정 화면이 이 값을 보면 숨긴 추천 묶음으로 스크롤 */
export const MESSENGER_CONTACTS_HIDDEN_HREF = `${MESSENGER_CONTACTS_SETTINGS_HREF}&focus=hidden`;
/** 연락처 화면 뒤로(기록 없을 때) = 메신저 친구 탭 — 1단 머리글 규칙·화면이 같은 값 */
export const MESSENGER_CONTACTS_BACK_HREF = "/community-messenger?section=friends";

/** 연락처 회원 표시 이름 — 이 기기 연락처면 기기에 저장된 이름(서버로 안 보냄), 아니면 DIBAY 닉네임·아이디 (행·시트·확인 문구 공통) */
export function contactsMemberDisplayName(member: ContactsMemberRow, deviceNames: Record<string, string> | null | undefined): string {
  const local = member.on_this_device && member.client_ref ? deviceNames?.[member.client_ref] : null;
  return local || member.nickname || member.dibay_id || member.username || "";
}
