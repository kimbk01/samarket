import "server-only";

import { getSupabaseServer, type SupabaseServer } from "@/lib/chat/supabase-server";
import { toMoimErrorCode, type MoimErrorCode } from "@/lib/moim/moim-error-codes";
import type { MoimAction, MoimRole } from "@/lib/moim/moim-permission-contract";

/**
 * 모임 RPC 호출 (서버 전용, service_role). 모든 쓰기는 이 파일의 함수만 쓴다.
 * DB 함수가 권한·정원·차단·메신저 방 입장/퇴장을 한 트랜잭션에서 처리한다 (마이그레이션 20271112210000).
 */

export type MoimRpcResult<T extends Record<string, unknown> = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: MoimErrorCode; detail?: string };

async function callMoimRpc<T extends Record<string, unknown>>(
  fn: string,
  args: Record<string, unknown>,
  sb?: SupabaseServer
): Promise<MoimRpcResult<T>> {
  const client = sb ?? getSupabaseServer();
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    return { ok: false, error: toMoimErrorCode(error.message), detail: error.message };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) {
    return { ok: false, error: toMoimErrorCode(row.error) };
  }
  return { ok: true, ...(row as T) };
}

export type MoimCreateInput = {
  name: string;
  intro: string;
  categoryId: string;
  joinMode: "instant" | "approval";
  capacity?: number | null;
  coverImageUrl?: string | null;
  ageMinBirthYear?: number | null;
  ageMaxBirthYear?: number | null;
  questions?: string[];
  nickname?: string;
  avatarUrl?: string | null;
  bio?: string;
};

export function moimCreate(actorId: string, input: MoimCreateInput, sb?: SupabaseServer) {
  return callMoimRpc<{ moim_id: string; room_id: string }>(
    "moim_create",
    {
      p_actor: actorId,
      p: {
        name: input.name,
        intro: input.intro,
        category_id: input.categoryId,
        join_mode: input.joinMode,
        capacity: input.capacity ?? null,
        cover_image_url: input.coverImageUrl ?? null,
        age_min_birth_year: input.ageMinBirthYear ?? null,
        age_max_birth_year: input.ageMaxBirthYear ?? null,
        questions: input.questions ?? [],
        nickname: input.nickname ?? null,
        avatar_url: input.avatarUrl ?? null,
        bio: input.bio ?? "",
      },
    },
    sb
  );
}

export type MoimMemberProfileInput = { nickname?: string; avatarUrl?: string | null; bio?: string };

function profilePayload(profile?: MoimMemberProfileInput, extra?: Record<string, unknown>) {
  return {
    ...(profile?.nickname !== undefined ? { nickname: profile.nickname } : {}),
    ...(profile?.avatarUrl !== undefined ? { avatar_url: profile.avatarUrl } : {}),
    ...(profile?.bio !== undefined ? { bio: profile.bio } : {}),
    ...(extra ?? {}),
  };
}

export function moimJoin(
  actorId: string,
  moimId: string,
  input: { answers?: string[]; profile?: MoimMemberProfileInput },
  sb?: SupabaseServer
) {
  return callMoimRpc<{ status: "active" | "pending"; room_id?: string; request_id?: string }>(
    "moim_join",
    { p_actor: actorId, p_moim: moimId, p: profilePayload(input.profile, { answers: input.answers ?? [] }) },
    sb
  );
}

export function moimJoinCancel(actorId: string, moimId: string, sb?: SupabaseServer) {
  return callMoimRpc("moim_join_cancel", { p_actor: actorId, p_moim: moimId }, sb);
}

export function moimJoinDecide(actorId: string, requestId: string, approve: boolean, reason: string | null, sb?: SupabaseServer) {
  return callMoimRpc<{ moim_id: string; user_id: string; approved: boolean }>(
    "moim_join_decide",
    { p_actor: actorId, p_request: requestId, p_approve: approve, p_reason: reason },
    sb
  );
}

export function moimLeave(actorId: string, moimId: string, sb?: SupabaseServer) {
  return callMoimRpc("moim_leave", { p_actor: actorId, p_moim: moimId }, sb);
}

export function moimMemberRemove(
  actorId: string,
  moimId: string,
  targetUserId: string,
  ban: boolean,
  reason: string | null,
  sb?: SupabaseServer
) {
  return callMoimRpc(
    "moim_member_remove",
    { p_actor: actorId, p_moim: moimId, p_target: targetUserId, p_ban: ban, p_reason: reason },
    sb
  );
}

export function moimMemberUnban(actorId: string, moimId: string, targetUserId: string, sb?: SupabaseServer) {
  return callMoimRpc("moim_member_unban", { p_actor: actorId, p_moim: moimId, p_target: targetUserId }, sb);
}

export function moimMemberRoleSet(
  actorId: string,
  moimId: string,
  targetUserId: string,
  role: Exclude<MoimRole, "host">,
  sb?: SupabaseServer
) {
  return callMoimRpc(
    "moim_member_role_set",
    { p_actor: actorId, p_moim: moimId, p_target: targetUserId, p_role: role },
    sb
  );
}

export function moimHostTransferRequest(actorId: string, moimId: string, toUserId: string, sb?: SupabaseServer) {
  return callMoimRpc<{ transfer_id: string }>(
    "moim_host_transfer_request",
    { p_actor: actorId, p_moim: moimId, p_to: toUserId },
    sb
  );
}

export function moimHostTransferRespond(actorId: string, transferId: string, accept: boolean, sb?: SupabaseServer) {
  return callMoimRpc<{ accepted: boolean; moim_id?: string }>(
    "moim_host_transfer_respond",
    { p_actor: actorId, p_transfer: transferId, p_accept: accept },
    sb
  );
}

export function moimClose(actorId: string, moimId: string, confirmName: string, sb?: SupabaseServer) {
  return callMoimRpc("moim_close", { p_actor: actorId, p_moim: moimId, p_confirm_name: confirmName }, sb);
}

export type MoimInfoPatch = Partial<{
  name: string;
  intro: string;
  categoryId: string;
  joinMode: "instant" | "approval";
  capacity: number | null;
  coverImageUrl: string | null;
  ageMinBirthYear: number | null;
  ageMaxBirthYear: number | null;
  questions: string[];
}>;

export function moimUpdateInfo(
  actorId: string,
  moimId: string,
  patch: MoimInfoPatch,
  expectedUpdatedAt: string,
  sb?: SupabaseServer
) {
  const p: Record<string, unknown> = {};
  if (patch.name !== undefined) p.name = patch.name;
  if (patch.intro !== undefined) p.intro = patch.intro;
  if (patch.categoryId !== undefined) p.category_id = patch.categoryId;
  if (patch.joinMode !== undefined) p.join_mode = patch.joinMode;
  if (patch.capacity !== undefined) p.capacity = patch.capacity;
  if (patch.coverImageUrl !== undefined) p.cover_image_url = patch.coverImageUrl;
  if (patch.ageMinBirthYear !== undefined) p.age_min_birth_year = patch.ageMinBirthYear;
  if (patch.ageMaxBirthYear !== undefined) p.age_max_birth_year = patch.ageMaxBirthYear;
  if (patch.questions !== undefined) p.questions = patch.questions;
  return callMoimRpc<{ updated_at: string }>(
    "moim_update_info",
    { p_actor: actorId, p_moim: moimId, p, p_expected_updated_at: expectedUpdatedAt },
    sb
  );
}

export function moimPermissionsSet(
  actorId: string,
  moimId: string,
  overrides: Partial<Record<MoimAction, MoimRole>>,
  sb?: SupabaseServer
) {
  return callMoimRpc("moim_permissions_set", { p_actor: actorId, p_moim: moimId, p: overrides }, sb);
}

export function moimProfileUpdate(actorId: string, moimId: string, profile: MoimMemberProfileInput, sb?: SupabaseServer) {
  return callMoimRpc("moim_profile_update", { p_actor: actorId, p_moim: moimId, p: profilePayload(profile) }, sb);
}

export function moimInviteLinkCreate(actorId: string, moimId: string, expiresAt: string | null, sb?: SupabaseServer) {
  return callMoimRpc<{ invite_id: string; token: string }>(
    "moim_invite_link_create",
    { p_actor: actorId, p_moim: moimId, p_expires_at: expiresAt },
    sb
  );
}

export function moimInviteLinkRevoke(actorId: string, inviteId: string, sb?: SupabaseServer) {
  return callMoimRpc("moim_invite_link_revoke", { p_actor: actorId, p_invite: inviteId }, sb);
}

export function moimInviteLinkResolve(token: string, sb?: SupabaseServer) {
  return callMoimRpc<{ moim_id: string; inviter_id: string }>("moim_invite_link_resolve", { p_token: token }, sb);
}

export function moimInviteSend(actorId: string, moimId: string, inviteeUserId: string, sb?: SupabaseServer) {
  return callMoimRpc<{ invite_target_id: string }>(
    "moim_invite_send",
    { p_actor: actorId, p_moim: moimId, p_invitee: inviteeUserId },
    sb
  );
}

export function moimInviteRespond(
  actorId: string,
  inviteTargetId: string,
  accept: boolean,
  profile?: MoimMemberProfileInput,
  sb?: SupabaseServer
) {
  return callMoimRpc<{ status: "active" | "pending" | "declined"; moim_id?: string }>(
    "moim_invite_respond",
    { p_actor: actorId, p_invite_target: inviteTargetId, p_accept: accept, p: profilePayload(profile) },
    sb
  );
}
