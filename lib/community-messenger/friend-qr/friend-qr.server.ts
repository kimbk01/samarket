import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { resolveDirectInteractionGuard } from "@/lib/community-messenger/social-relations";
import { notifyCommunityMessengerFriendAddedViaQr } from "@/lib/notifications/community-messenger-friend-inapp-notify";
import { buildFriendQrUrl, isFriendQrToken } from "@/lib/community-messenger/friend-qr/friend-qr-contract";
import { invalidateBootstrapLiteSocialDeferredForPair } from "@/lib/community-messenger/bootstrap-lite-social-deferred-cache";

/**
 * QR 친구 추가 서버 (설계안 v3 §3.6) — DB 함수만 부른다:
 * member_friend_qr_ensure · member_friend_qr_regenerate · member_friend_qr_resolve · cm_add_friend_via_qr
 */
type Rpc = { ok?: boolean; error?: string; token?: string } & Record<string, unknown>;

function sbOrNull(): SupabaseClient<any> | null {
  return tryCreateSupabaseServiceClient() as SupabaseClient<any> | null;
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export type MyFriendQr = { token: string; url: string };

export async function ensureMyFriendQr(userId: string): Promise<{ ok: true; qr: MyFriendQr } | { ok: false; error: string }> {
  const sb = sbOrNull();
  if (!sb) return { ok: false, error: "supabase_unavailable" };
  const { data, error } = await sb.rpc("member_friend_qr_ensure", { p_user_id: userId });
  const r = (data ?? {}) as Rpc;
  if (error || r.ok !== true || !isFriendQrToken(r.token)) return { ok: false, error: r.error ?? "qr_unavailable" };
  return { ok: true, qr: { token: r.token, url: buildFriendQrUrl(r.token) } };
}

/** 내 QR 카드 — 스캔한 친구가 보는 것과 같은 규칙(닉네임 → 표시 이름, @아이디, 사진) + QR 친구 추가 허용 여부 */
export type MyFriendQrCard = {
  qr: MyFriendQr;
  owner: { displayName: string; dibayId: string | null; avatarUrl: string | null };
  /** 「QR로 친구 추가 허용」 — 끄면 DB 가 이 QR 을 막는다(`member_friend_qr_resolve` → qr_disabled) */
  qrAddAllowed: boolean;
};

/**
 * 내 QR 화면 한 번에 — 토큰·카드 내용·허용 여부 (QR 친구 근본 재감사 G2·G3).
 * 따로 불러오면 글자가 늦게 그려져 시트 높이가 변했다.
 */
export async function loadMyFriendQrCard(userId: string): Promise<{ ok: true; card: MyFriendQrCard } | { ok: false; error: string }> {
  const sb = sbOrNull();
  if (!sb) return { ok: false, error: "supabase_unavailable" };
  const [ensured, profileRes, settingsRes] = await Promise.all([
    ensureMyFriendQr(userId),
    sb.from("profiles").select("nickname, display_name, dibay_id, avatar_url").eq("id", userId).maybeSingle(),
    sb.from("member_discovery_settings").select("allow_qr_add").eq("user_id", userId).maybeSingle(),
  ]);
  if (!ensured.ok) return ensured;
  if (profileRes.error) return { ok: false, error: "profile_unavailable" };
  const row = (profileRes.data ?? {}) as Record<string, unknown>;
  const settings = (settingsRes.data ?? null) as { allow_qr_add?: unknown } | null;
  return {
    ok: true,
    card: {
      qr: ensured.qr,
      owner: {
        displayName: text(row.nickname) || text(row.display_name),
        dibayId: text(row.dibay_id).toLowerCase() || null,
        avatarUrl: text(row.avatar_url) || null,
      },
      qrAddAllowed: settings?.allow_qr_add !== false,
    },
  };
}

export async function regenerateMyFriendQr(
  userId: string
): Promise<{ ok: true; qr: MyFriendQr } | { ok: false; error: string }> {
  const sb = sbOrNull();
  if (!sb) return { ok: false, error: "supabase_unavailable" };
  const { data, error } = await sb.rpc("member_friend_qr_regenerate", { p_user_id: userId });
  const r = (data ?? {}) as Rpc;
  if (error || r.ok !== true || !isFriendQrToken(r.token)) return { ok: false, error: r.error ?? "qr_unavailable" };
  return { ok: true, qr: { token: r.token, url: buildFriendQrUrl(r.token) } };
}

export type FriendQrPreview = {
  userId: string;
  dibayId: string | null;
  displayName: string;
  avatarUrl: string | null;
};

/** 토큰 → QR 주인 미리보기 (로그인 없이도 — 웹 /f 페이지) */
export async function resolveFriendQrOwner(
  token: string
): Promise<{ ok: true; owner: FriendQrPreview } | { ok: false; error: string }> {
  if (!isFriendQrToken(token)) return { ok: false, error: "qr_invalid" };
  const sb = sbOrNull();
  if (!sb) return { ok: false, error: "supabase_unavailable" };
  const { data, error } = await sb.rpc("member_friend_qr_resolve", { p_token: token });
  const r = (data ?? {}) as Rpc;
  if (error || r.ok !== true) return { ok: false, error: r.error ?? "qr_invalid" };
  const userId = text(r.user_id);
  if (!userId) return { ok: false, error: "qr_invalid" };
  const dibayId = text(r.dibay_id) || null;
  return {
    ok: true,
    owner: {
      userId,
      dibayId,
      /** 이름만 — 아이디로 대신 채우지 않는다 (시안 I · 재감사 L2). 없으면 화면이 「DIBAY 회원」 */
      displayName: text(r.nickname) || text(r.display_name),
      avatarUrl: text(r.avatar_url) || null,
    },
  };
}

export type FriendQrPreviewForViewer = FriendQrPreview & { isSelf: boolean; isFriend: boolean; blocked: boolean };

/** 앱 안 스캔 결과 시트 — 보는 사람 기준 관계 포함 */
export async function resolveFriendQrForViewer(
  viewerUserId: string,
  token: string
): Promise<{ ok: true; preview: FriendQrPreviewForViewer } | { ok: false; error: string }> {
  const res = await resolveFriendQrOwner(token);
  if (!res.ok) return res;
  const isSelf = res.owner.userId === viewerUserId;
  if (isSelf) return { ok: true, preview: { ...res.owner, isSelf, isFriend: false, blocked: false } };
  const guard = await resolveDirectInteractionGuard(viewerUserId, res.owner.userId);
  const blocked = guard.isBlockedByMe || guard.isBlockedByPeer;
  /** 차단 사이는 미리보기도 하지 않는다 — 실패 문구 하나 (이유를 밝히지 않음) */
  if (blocked) return { ok: false, error: "blocked_target" };
  return { ok: true, preview: { ...res.owner, isSelf, isFriend: guard.isFriend, blocked } };
}

/** 스캔한 사람과 QR 주인을 바로 친구로 + QR 주인에게 알림 */
export async function addFriendViaQr(
  viewerUserId: string,
  token: string
): Promise<{ ok: true; peerUserId: string; alreadyFriend: boolean } | { ok: false; error: string }> {
  if (!isFriendQrToken(token)) return { ok: false, error: "qr_invalid" };
  const sb = sbOrNull();
  if (!sb) return { ok: false, error: "supabase_unavailable" };
  const { data, error } = await sb.rpc("cm_add_friend_via_qr", { p_viewer: viewerUserId, p_token: token });
  if (error) return { ok: false, error: "qr_add_failed" };
  const r = (data ?? {}) as Rpc;
  if (r.ok !== true) return { ok: false, error: r.error ?? "qr_add_failed" };
  const peerUserId = text(r.peer_user_id);
  const alreadyFriend = r.idempotent === true;
  if (peerUserId && !alreadyFriend) {
    /** 친구 관계가 바뀌었으니 두 사람의 친구 목록 캐시를 지운다 — 다른 친구 경로와 같게 (QR 친구 재감사, 2026-11-12) */
    invalidateBootstrapLiteSocialDeferredForPair(viewerUserId, peerUserId);
    after(async () => {
      try {
        const { data: me } = await sb
          .from("profiles")
          .select("nickname, display_name")
          .eq("id", viewerUserId)
          .maybeSingle();
        const row = (me ?? {}) as { nickname?: string | null; display_name?: string | null };
        await notifyCommunityMessengerFriendAddedViaQr(sb, {
          ownerUserId: peerUserId,
          scannerUserId: viewerUserId,
          scannerLabel: text(row.nickname) || text(row.display_name),
        });
      } catch {
        /* 알림 실패는 친구 추가 결과에 영향 없음 */
      }
    });
  }
  return { ok: true, peerUserId, alreadyFriend };
}
