/**
 * 커뮤니티 글쓰기 편집기 플래그 — 서버 env `COMMUNITY_WYSIWYG_EDITOR`.
 * - `off`   : 모두 기존 편집기
 * - `admin` : (기본값) 관리자 계정이 글쓰기 화면에서 직접 켤 때만 새 편집기 — 일반 회원 비노출
 * - `on`    : 모두 새 편집기 (Owner 공개 승인 후에만 설정)
 */
export type CommunityWriteEditorRollout = "off" | "admin" | "on";

export function resolveCommunityWriteEditorRollout(raw: string | undefined | null): CommunityWriteEditorRollout {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "on" || v === "off") return v;
  return "admin";
}

/** 관리자 검증용 기기별 선택(localStorage) */
export const COMMUNITY_WRITE_EDITOR_OPT_IN_KEY = "dibay:philife-write-editor";
