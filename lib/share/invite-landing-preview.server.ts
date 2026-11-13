import "server-only";

/**
 * 초대 랜딩 비회원 미리보기 (Owner G-7 2026-11-14 「초대 랜딩만 최소 정보 공개. 가입은 기존 인증·권한 검사」).
 * 설계: docs/audit/dibay-unified-share-audit-design-2026-11-14.md §D-6 · §D-7 · G-7.
 *
 * - 공개 = 이름 · 대표 사진 · 인원 · 승인 필요 여부만. 소개글·멤버 목록·글·대화는 내보내지 않는다.
 * - 무효(없음·만료·철회·사용 한도·닫힘·차단) = null → 「초대 링크가 만료되었어요」.
 * - 링크가 가입 권한을 주지 않는다 — 가입은 로그인 후 기존 화면·API(인증·권한·승인 검사)로만.
 * - 같은 요청 안에서 미리보기(generateMetadata)와 본문이 1회 조회를 공유한다(React cache).
 */
import { cache } from "react";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { moimInviteLinkResolve } from "@/lib/moim/server/moim-rpc.server";
import { previewGroupInviteLink } from "@/lib/community-messenger/group/group-room-invite-link-service";

export type InviteLandingPreview = {
  title: string;
  imageUrl: string | null;
  memberCount: number;
  requiresApproval: boolean;
};

const MOIM_TOKEN_RE = /^[a-f0-9]{64}$/;

function httpsOrNull(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return /^https:\/\//i.test(s) ? s : null;
}

export const loadMoimInviteGuestPreview = cache(async (rawToken: string): Promise<InviteLandingPreview | null> => {
  const token = (rawToken ?? "").trim();
  if (!MOIM_TOKEN_RE.test(token)) return null;
  try {
    const sb = getSupabaseServer();
    const resolved = await moimInviteLinkResolve(token, sb);
    if (!resolved.ok) return null;
    const { data } = await sb
      .from("moims")
      .select("name, cover_image_url, member_count, join_mode, status, platform_state")
      .eq("id", resolved.moim_id)
      .maybeSingle();
    const row = data as {
      name?: string;
      cover_image_url?: string | null;
      member_count?: number;
      join_mode?: string;
      status?: string;
      platform_state?: string;
    } | null;
    if (!row || row.status !== "active" || row.platform_state === "blocked") return null;
    const title = (row.name ?? "").trim();
    if (!title) return null;
    return {
      title,
      imageUrl: httpsOrNull(row.cover_image_url),
      memberCount: Math.max(0, Math.floor(Number(row.member_count) || 0)),
      requiresApproval: row.join_mode === "approval",
    };
  } catch {
    return null;
  }
});

export const loadGroupInviteGuestPreview = cache(async (rawToken: string): Promise<InviteLandingPreview | null> => {
  let token = "";
  try {
    token = decodeURIComponent(rawToken ?? "").trim();
  } catch {
    return null;
  }
  if (!token) return null;
  try {
    const r = await previewGroupInviteLink({ userId: null, inviteToken: token });
    if (!r.ok) return null;
    const title = r.preview.title.trim();
    if (!title) return null;
    return {
      title,
      imageUrl: httpsOrNull(r.preview.avatarUrl),
      memberCount: Math.max(0, Math.floor(r.preview.memberCount || 0)),
      requiresApproval: r.preview.requiresApproval,
    };
  } catch {
    return null;
  }
});
