/**
 * C-4 — 메신저 첨부 조회 권한 판정 + 짧은 서명 URL 발급 (서버 전용 · 의존성 주입으로 테스트 가능).
 *
 * 규칙:
 * 1. 요청 객체(`o=bucket/path`)는 **해당 메시지 행이 실제로 가리키는 객체**여야 한다(임의 경로 열람 차단).
 * 2. 일반 열람: 요청자가 메시지 방(`message.room_id`)의 참가자여야 한다. 라우트 방 id 가 레거시·거래 별칭이면
 *    canonical 해석 결과가 메시지 방과 같아야 한다.
 * 3. 관리자 열람(`ctx=admin`): 참가자 판정을 건너뛰고 `authorizeAdmin`(권한 `chats` + 본문 열람 정책 + 감사)만 통과.
 * 4. 레거시 공개 버킷(post-images) 객체도 동일 판정 후 서명 URL 로 보낸다 — 새 링크가 원 공개 URL 을 노출하지 않게.
 * 5. 삭제된 메시지(`deleted_at`·`deleted_for_everyone_at`)는 404.
 */
import {
  messengerMessageReferencesMediaObject,
  type MessengerMediaObjectRef,
} from "@/lib/community-messenger/media/messenger-media-ref";

/** 서명 URL 유효 시간 — 10분. 라우트 302 캐시(5분)보다 길어야 캐시된 리다이렉트가 만료 URL 로 가지 않는다. */
export const MESSENGER_MEDIA_SIGNED_URL_TTL_SEC = 600;
/** 302 응답 브라우저 캐시 — 같은 썸네일 반복 렌더 시 라우트 재호출 억제. */
export const MESSENGER_MEDIA_REDIRECT_MAX_AGE_SEC = 300;

export type MessengerMediaMessageRow = {
  id: string;
  room_id: string;
  content?: string | null;
  metadata?: Record<string, unknown> | null;
  deleted_at?: string | null;
  deleted_for_everyone_at?: string | null;
  /** 관리자 숨김 — 참가자에게는 404, 관리자 열람(adminContext)은 허용 */
  is_hidden_by_admin?: boolean | null;
};

export type MessengerMediaAccessDeps = {
  loadMessage: (messageId: string) => Promise<MessengerMediaMessageRow | null>;
  isParticipant: (roomId: string, userId: string) => Promise<boolean>;
  /** 라우트 방 id → 요청자 기준 canonical CM 방 id (참가자 아님·없음 → null). */
  resolveCanonicalRoomId: (userId: string, rawRoomId: string) => Promise<string | null>;
  /** 관리자 열람 권한·정책·감사 — 통과 시 ok. 실패 응답 형식은 호출부(라우트)가 결정. */
  authorizeAdmin: (input: {
    roomId: string;
    messageId: string;
    object: MessengerMediaObjectRef;
  }) => Promise<{ ok: true } | { ok: false; status: number; error: string; response?: unknown }>;
  createSignedUrl: (input: {
    bucket: string;
    path: string;
    expiresInSec: number;
    download: string | null;
  }) => Promise<string | null>;
};

export type MessengerMediaAccessResult =
  | { ok: true; signedUrl: string; viewer: "participant" | "admin"; expiresInSec: number }
  | { ok: false; status: number; error: string; response?: unknown };

function t(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** `download` 파일명 — 경로·제어문자 제거, 200자 제한. 비면 null. */
export function sanitizeMessengerMediaDownloadName(raw: unknown): string | null {
  const s = t(raw)
    .replace(/[\u0000-\u001f\u007f/\\]/g, "_")
    .slice(0, 200);
  return s || null;
}

export async function resolveMessengerMediaAccess(
  input: {
    userId: string;
    rawRoomId: string;
    messageId: string;
    object: MessengerMediaObjectRef;
    download?: string | null;
    adminContext?: boolean;
  },
  deps: MessengerMediaAccessDeps
): Promise<MessengerMediaAccessResult> {
  const rawRoomId = t(input.rawRoomId);
  const messageId = t(input.messageId);
  if (!rawRoomId || !messageId) return { ok: false, status: 400, error: "bad_request" };

  const msg = await deps.loadMessage(messageId);
  if (!msg || t(msg.deleted_at) || t(msg.deleted_for_everyone_at)) {
    return { ok: false, status: 404, error: "not_found" };
  }
  if (msg.is_hidden_by_admin === true && !input.adminContext) {
    return { ok: false, status: 404, error: "not_found" };
  }
  const messageRoomId = t(msg.room_id);
  if (!messageRoomId) return { ok: false, status: 404, error: "not_found" };
  if (!messengerMessageReferencesMediaObject({ metadata: msg.metadata, content: msg.content }, input.object)) {
    return { ok: false, status: 404, error: "not_found" };
  }

  let viewer: "participant" | "admin";
  if (input.adminContext) {
    if (rawRoomId !== messageRoomId) return { ok: false, status: 404, error: "not_found" };
    const admin = await deps.authorizeAdmin({ roomId: messageRoomId, messageId, object: input.object });
    if (!admin.ok) return admin;
    viewer = "admin";
  } else {
    if (rawRoomId !== messageRoomId) {
      const canonical = await deps.resolveCanonicalRoomId(input.userId, rawRoomId);
      if (!canonical || canonical !== messageRoomId) return { ok: false, status: 403, error: "forbidden" };
    }
    if (!(await deps.isParticipant(messageRoomId, input.userId))) {
      return { ok: false, status: 403, error: "forbidden" };
    }
    viewer = "participant";
  }

  const signedUrl = await deps.createSignedUrl({
    bucket: input.object.bucket,
    path: input.object.path,
    expiresInSec: MESSENGER_MEDIA_SIGNED_URL_TTL_SEC,
    download: sanitizeMessengerMediaDownloadName(input.download),
  });
  if (!signedUrl) return { ok: false, status: 404, error: "object_not_found" };
  return { ok: true, signedUrl, viewer, expiresInSec: MESSENGER_MEDIA_SIGNED_URL_TTL_SEC };
}
