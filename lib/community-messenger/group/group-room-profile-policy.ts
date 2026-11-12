import { isOwnProfileAvatarPublicUrl } from "@/lib/profile/member-avatar-url-policy";
import { canEditGroupRoomMeta, type GroupRoomPermissionContext } from "@/lib/community-messenger/group/group-room-permissions";

export type GroupRoomProfilePatch = {
  title?: string;
  avatarUrl?: string | null;
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function canEditGroupRoomProfile(ctx: GroupRoomPermissionContext): boolean {
  return canEditGroupRoomMeta(ctx);
}

export function canViewGroupRoomProfile(_ctx: GroupRoomPermissionContext): boolean {
  return true;
}

/**
 * 그룹 사진·제목 저장 값 검증 (group-chat-full-fix-design G7).
 * - 제목: 보내면 비울 수 없다(역할 무관 — 예전에는 방장·관리자가 빈 제목 저장 가능).
 * - 사진: null(지우기) · 지금 값 그대로 · **편집자 본인이 올린** `post-images/<편집자>/profile/<uuid>.<ext>` 공개 주소만
 *   (회원 사진과 같은 규칙 `isOwnProfileAvatarPublicUrl` — 예전에는 아무 주소나 저장됨).
 */
export function normalizeGroupRoomProfilePatch(
  patch: GroupRoomProfilePatch,
  ctx: { editorUserId: string; currentAvatarUrl: string | null; storageOrigin: string | null }
): { ok: true; patch: GroupRoomProfilePatch } | { ok: false; error: "title_required" | "invalid_avatar_url" | "content_required" } {
  const out: GroupRoomProfilePatch = {};
  if (typeof patch.title === "string") {
    const title = trimText(patch.title).slice(0, 120);
    if (!title) return { ok: false, error: "title_required" };
    out.title = title;
  }
  if (patch.avatarUrl !== undefined) {
    const url = patch.avatarUrl == null ? "" : trimText(patch.avatarUrl).slice(0, 2048);
    if (!url) {
      out.avatarUrl = null;
    } else if (
      (ctx.currentAvatarUrl != null && url === ctx.currentAvatarUrl.trim()) ||
      isOwnProfileAvatarPublicUrl(ctx.editorUserId, url, ctx.storageOrigin)
    ) {
      out.avatarUrl = url;
    } else {
      return { ok: false, error: "invalid_avatar_url" };
    }
  }
  return Object.keys(out).length ? { ok: true, patch: out } : { ok: false, error: "content_required" };
}
