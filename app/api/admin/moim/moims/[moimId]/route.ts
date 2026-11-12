/**
 * /api/admin/moim/moims/[moimId] — 모임 상세 (설계 moim §8 「모임 상세」). 권한 키 `moim`.
 * GET  ?section=info(기본)|members|requests|posts|comments|schedules|album|chats|reports|sanctions|events|profile_history
 *      (+ limit · offset · userId(profile_history) · postId(comments))
 * PATCH { patch: {name,intro,coverImageUrl,categoryId,capacity,joinMode,lguId,questions}, expectedUpdatedAt, reason }
 *      → moim_admin_update_info (낙관적 잠금 · 사유 필수) · 모임장에게 `moim_admin_info_updated` 알림
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { MOIM_ADMIN_DETAIL_SECTIONS, pickEnum } from "@/lib/admin/moim/moim-admin-contract";
import { loadAdminMoimInfo, loadAdminMoimSection, parseMoimAdminPage } from "@/lib/admin/moim/moim-admin-queries.server";
import {
  moimAdminBad,
  moimAdminJson,
  moimAdminReadError,
  moimAdminReason,
  moimAdminRpcResponse,
  moimAdminUuid,
} from "@/lib/admin/moim/moim-admin-route.server";
import { moimAdminUpdateInfo, type MoimAdminInfoPatch } from "@/lib/moim/server/moim-rpc.server";
import { moimPaths, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const gate = await requireAdminPermission("moim");
  if (!gate.ok) return gate.response;
  const moimId = moimAdminUuid((await params).moimId);
  if (!moimId) return moimAdminBad("moim_not_found", 404);
  const sp = req.nextUrl.searchParams;
  const section = pickEnum(MOIM_ADMIN_DETAIL_SECTIONS, sp.get("section"), "info");
  if (section === "info") {
    const info = await loadAdminMoimInfo(gate.sb, moimId);
    if (!info.ok) return moimAdminReadError(info.error);
    return NextResponse.json({ ...info, viewer: { isSuperAdmin: gate.actor.isSuperAdmin } });
  }
  const res = await loadAdminMoimSection(gate.sb, moimId, section, parseMoimAdminPage(sp), {
    userId: moimAdminUuid(sp.get("userId")),
    postId: moimAdminUuid(sp.get("postId")),
  });
  if (!res.ok) return moimAdminReadError(res.error);
  return NextResponse.json(res);
}

type PatchBody = {
  patch?: Record<string, unknown>;
  expectedUpdatedAt?: unknown;
  reason?: unknown;
};

function str(v: unknown, max: number): string | undefined {
  return typeof v === "string" ? v.slice(0, max) : undefined;
}

function toPatch(raw: Record<string, unknown>): MoimAdminInfoPatch | null {
  const out: MoimAdminInfoPatch = {};
  if ("name" in raw) out.name = str(raw.name, 200) ?? "";
  if ("intro" in raw) out.intro = str(raw.intro, 5000) ?? "";
  if ("coverImageUrl" in raw) out.coverImageUrl = typeof raw.coverImageUrl === "string" && raw.coverImageUrl.trim() ? raw.coverImageUrl.trim().slice(0, 1000) : null;
  if ("categoryId" in raw) {
    const id = moimAdminUuid(raw.categoryId);
    if (!id) return null;
    out.categoryId = id;
  }
  if ("capacity" in raw) {
    if (raw.capacity === null || raw.capacity === "") out.capacity = null;
    else {
      const n = Math.floor(Number(raw.capacity));
      if (!Number.isFinite(n)) return null;
      out.capacity = n;
    }
  }
  if ("joinMode" in raw) {
    if (raw.joinMode !== "instant" && raw.joinMode !== "approval") return null;
    out.joinMode = raw.joinMode;
  }
  if ("lguId" in raw) out.lguId = str(raw.lguId, 80) ?? "";
  if ("questions" in raw) {
    if (!Array.isArray(raw.questions)) return null;
    out.questions = raw.questions.filter((q): q is string => typeof q === "string").map((q) => q.slice(0, 200)).slice(0, 5);
  }
  return out;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await requireAdminPermission("moim");
  if (!gate.ok) return gate.response;
  const moimId = moimAdminUuid((await params).moimId);
  if (!moimId) return moimAdminBad("moim_not_found", 404);
  const body = await moimAdminJson<PatchBody>(req);
  const reason = moimAdminReason(body?.reason);
  if (!reason) return moimAdminBad("moim_admin_reason_required");
  const expected = typeof body?.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : "";
  if (!expected) return moimAdminBad("moim_conflict", 409);
  const patch = body?.patch && typeof body.patch === "object" ? toPatch(body.patch) : null;
  if (!patch || Object.keys(patch).length === 0) return moimAdminBad();
  const result = await moimAdminUpdateInfo(gate.actor.userId, moimId, patch, expected, reason, gate.sb);
  if (result.ok && result.host_user_id) {
    await notifyMoimMany(gate.sb, [result.host_user_id], {
      kind: "moim_admin_info_updated",
      moimId,
      linkUrl: moimPaths.home(moimId),
      dedupeRef: String(result.updated_at ?? Date.now()),
      vars: { moim: result.name ?? "" },
    });
  }
  return moimAdminRpcResponse(result);
}
