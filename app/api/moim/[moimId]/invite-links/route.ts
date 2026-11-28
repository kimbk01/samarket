import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead, guardMoimWrite, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { listMoimInviteLinks, loadMoimAccess, moimCanMap } from "@/lib/moim/server/moim-queries.server";
import { moimListCapped } from "@/lib/moim/moim-api-types";
import { moimInviteLinkCreate } from "@/lib/moim/server/moim-rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimRead(req, { rateKey: "invite_links" });
  if (!g.ok) return g.response;
  const access = await loadMoimAccess(g.sb, moimId, g.userId);
  if (!access) return moimNotFound();
  const links = await listMoimInviteLinks(g.sb, access);
  if (!links) return NextResponse.json({ ok: false, error: "moim_forbidden" }, { status: 403 });
  /** R4 #6: 조회 상한 500 — 만료 링크는 DB 에서 거르므로 500행이면 상한에 닿은 것 */
  return NextResponse.json({ ok: true, links, capped: moimListCapped(links.length) });
}

/** R5 C19: 다시 쓸 링크의 남은 기간 하한 — 곧 만료될 링크는 공유하지 않는다 */
const REUSE_MIN_REMAINING_MS = 24 * 60 * 60 * 1000;

/**
 * P4 초대 링크 만들기 — body { expiresAt: ISO | null, reuse?: true }
 * R5 C19: reuse = 머리글 공유. 권한 확인 뒤 내가 만든 쓸 수 있는 링크(취소 안 됨·만료까지 24시간 넘게 남음)가 있으면 그것을 돌려준다
 * (공유를 여러 번 눌러도 링크가 쌓이지 않음). 운영 › 초대 링크 화면의 「새 링크」는 reuse 없이 늘 새로 만든다.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "invite_link_create", limit: 10, writeKind: "none" });
  if (!g.ok) return g.response;
  const body = (await readMoimJson<{ expiresAt?: unknown; reuse?: unknown }>(req)) ?? {};
  const expiresAt = typeof body.expiresAt === "string" && !Number.isNaN(Date.parse(body.expiresAt)) ? body.expiresAt : null;
  if (body.reuse === true) {
    const access = await loadMoimAccess(g.sb, moimId, g.userId);
    if (!access) return moimNotFound();
    if (!moimCanMap(access).manage_invite_link) return NextResponse.json({ ok: false, error: "moim_forbidden" }, { status: 403 });
    const minExpiry = new Date(Date.now() + REUSE_MIN_REMAINING_MS).toISOString();
    const { data } = await g.sb
      .from("moim_invites")
      .select("id, token")
      .eq("moim_id", moimId)
      .eq("created_by", g.userId)
      .is("revoked_at", null)
      .or(`expires_at.is.null,expires_at.gt.${minExpiry}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as { id: string; token: string } | null;
    if (row) return NextResponse.json({ ok: true, invite_id: row.id, token: row.token, reused: true });
  }
  return moimRpcResponse(await moimInviteLinkCreate(g.userId, moimId, expiresAt, g.sb));
}
