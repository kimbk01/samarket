import { NextRequest, NextResponse } from "next/server";
import { listNeighborFollowRows } from "@/lib/community/neighbor-follow-list.server";
import { loadMasterPublicCityLabelsByUserIds } from "@/lib/addresses/master-public-city-labels.server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  MEMBER_IDENTITY_PROFILE_SELECT,
  memberDisplayLabelFromRow,
  type MemberIdentityProfileFields,
} from "@/lib/users/public-member-identity";
import {
  listBlockedByMeIds,
  removeHiddenUserRelationshipById,
  unblockUserSocial,
} from "@/lib/community-messenger/social-relations";
import { restoreDirectRoomsOnUnblockForViewer } from "@/lib/community-messenger/participant-block-hide";
import { internalErrorResponse } from "@/lib/security/internal-error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 내정보 관계 목록 — 차단·숨김(조회·해제) · 관심이웃(조회만; 추가·해제는 `POST /api/community/neighbor-relations` 상태 지정).
 * 옛 「모아보는 사용자」(`favorite`, 운영에 없는 표를 읽던 목록)는 삭제 (관심이웃 설계 B · Owner 「시안대로 결정」 2026-11-28).
 */
type RelationType = "hidden" | "blocked" | "neighbor";

function getRelationType(raw: string): RelationType | null {
  if (raw === "hidden" || raw === "blocked" || raw === "neighbor") return raw;
  return null;
}

function isMissingTableError(message: string, table?: string): boolean {
  const lowered = message.toLowerCase();
  if (table && !lowered.includes(table.toLowerCase())) return false;
  return (
    lowered.includes("does not exist") ||
    lowered.includes("schema cache") ||
    lowered.includes("could not find the table")
  );
}

type RelationListItem = {
  id: string;
  targetId: string;
  createdAt: string;
  nickname: string | null;
  username: string | null;
  avatarUrl: string | null;
  regionName: string | null;
};

async function fetchProfileMap(
  sb: NonNullable<ReturnType<typeof tryCreateSupabaseServiceClient>>,
  targetIds: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const profileMap = new Map<string, Record<string, unknown>>();
  if (targetIds.length === 0) return profileMap;

  const { data: profiles } = await sb
    .from("profiles")
    .select(MEMBER_IDENTITY_PROFILE_SELECT)
    .in("id", targetIds);
  /** 지역 = 대표 주소 공개 시/군 (주소 SSOT · profiles.region_name 미사용) */
  const regionByUser = await loadMasterPublicCityLabelsByUserIds(sb, targetIds);

  for (const row of (profiles ?? []) as Record<string, unknown>[]) {
    const id = String(row.id ?? "").trim();
    if (id) profileMap.set(id, { ...row, master_public_city: regionByUser.get(id) ?? null });
  }
  return profileMap;
}

function mapProfilesToRelationItems(
  rows: Array<{ id: string; targetId: string; createdAt: string }>,
  profileMap: Map<string, Record<string, unknown>>
): RelationListItem[] {
  return rows.map((row) => {
    const profile = profileMap.get(row.targetId);
    const identity = profile
      ? memberDisplayLabelFromRow(profile as MemberIdentityProfileFields, { userId: row.targetId })
      : null;
    const dibayId =
      typeof profile?.dibay_id === "string" && profile.dibay_id.trim() ? profile.dibay_id.trim() : null;
    const nick =
      typeof profile?.nickname === "string" && profile.nickname.trim() ? profile.nickname.trim() : null;
    return {
      id: row.id,
      targetId: row.targetId,
      createdAt: row.createdAt,
      nickname: identity || nick || null,
      /** DTO field kept — Member public id = dibay_id */
      username: dibayId,
      avatarUrl: typeof profile?.avatar_url === "string" ? profile.avatar_url : null,
      regionName: typeof profile?.master_public_city === "string" ? profile.master_public_city : null,
    };
  });
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ type: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { type: rawType } = await context.params;
  const type = getRelationType(String(rawType ?? "").trim());
  if (!type) {
    return NextResponse.json({ ok: false, error: "invalid_relation_type" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: true, items: [], source: "fallback" });
  }

  if (type === "blocked") {
    const targetIds = await listBlockedByMeIds(auth.userId);
    if (targetIds.length === 0) {
      return NextResponse.json({ ok: true, items: [], source: "user_social_relations" });
    }
    const { data: socialRows } = await (sb as any)
      .from("user_social_relations")
      .select("id, target_user_id, created_at")
      .eq("owner_user_id", auth.userId)
      .eq("relation_type", "blocked")
      .in("target_user_id", targetIds);
    const relationRows = ((socialRows ?? []) as Array<{
      id?: string;
      target_user_id?: string;
      created_at?: string;
    }>)
      .map((row) => ({
        id: String(row.id ?? row.target_user_id ?? "").trim(),
        targetId: String(row.target_user_id ?? "").trim(),
        createdAt: String(row.created_at ?? ""),
      }))
      .filter((row) => row.id && row.targetId);
    const profileMap = await fetchProfileMap(sb, targetIds);
    const items = mapProfilesToRelationItems(relationRows, profileMap);
    return NextResponse.json({ ok: true, items, source: "user_social_relations" });
  }

  if (type === "hidden") {
    const { listHiddenUserRelationshipRowsResult } = await import(
      "@/lib/community-messenger/social-relations"
    );
    const hiddenResult = await listHiddenUserRelationshipRowsResult(auth.userId);
    if (!hiddenResult.ok) {
      return NextResponse.json(
        { ok: false, error: "hidden_list_unavailable" },
        { status: 500 }
      );
    }
    const relationRows = hiddenResult.rows;
    const targetIds = relationRows.map((row) => row.targetUserId);
    const profileMap = await fetchProfileMap(sb, targetIds);
    const items = mapProfilesToRelationItems(
      relationRows.map((row) => ({
        id: row.id,
        targetId: row.targetUserId,
        createdAt: row.createdAt,
      })),
      profileMap
    );
    return NextResponse.json({ ok: true, items, source: "user_relationships" });
  }

  if (type === "neighbor") {
    /** 관심이웃 = 저장 행(탈퇴·차단 상대 행은 DB 트리거가 지움 — 전체 수정 설계 v2 §5-3). 프로필은 아래 신원 조회 1회만 */
    const visible = await listNeighborFollowRows(sb, auth.userId);
    if (!visible.ok) {
      if (isMissingTableError(visible.error, "user_relationships")) {
        return NextResponse.json({ ok: true, items: [], source: "missing_table" });
      }
      return internalErrorResponse("neighbor_fetch_failed", "[me/relations GET neighbor]", new Error(visible.error));
    }
    const targetIds = visible.rows.map((row) => row.targetId);
    const profileMap = await fetchProfileMap(sb, targetIds);
    const items = mapProfilesToRelationItems(visible.rows, profileMap);
    return NextResponse.json({ ok: true, items, source: "user_relationships.neighbor_follow" });
  }

  return NextResponse.json({ ok: false, error: "invalid_relation_type" }, { status: 400 });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ type: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { type: rawType } = await context.params;
  const type = getRelationType(String(rawType ?? "").trim());
  if (!type) {
    return NextResponse.json({ ok: false, error: "invalid_relation_type" }, { status: 400 });
  }

  const relationId = req.nextUrl.searchParams.get("id")?.trim();
  const targetUserId = req.nextUrl.searchParams.get("targetUserId")?.trim();

  if (type === "blocked") {
    const target = targetUserId || "";
    if (!target) {
      return NextResponse.json({ ok: false, error: "missing_target_user_id" }, { status: 400 });
    }
    const result = await unblockUserSocial(auth.userId, target);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error ?? "unblock_failed" }, { status: 500 });
    }
    /** F-1 — 해제 성공 후에만 공통 복원 (실패 시 방 복원 금지) */
    await restoreDirectRoomsOnUnblockForViewer(auth.userId, target);
    return NextResponse.json({ ok: true });
  }

  if (type === "hidden") {
    if (!relationId) {
      return NextResponse.json({ ok: false, error: "missing_relation_id" }, { status: 400 });
    }
    const result = await removeHiddenUserRelationshipById(auth.userId, relationId);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error ?? "hidden_remove_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  /** 관심이웃 해제는 상태 지정 POST 한 곳 (관심이웃 설계 A) */
  return NextResponse.json({ ok: false, error: "invalid_relation_type" }, { status: 400 });
}
