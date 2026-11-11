import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead, guardMoimWrite, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { listMoimInviteLinks, loadMoimAccess } from "@/lib/moim/server/moim-queries.server";
import { moimInviteLinkCreate } from "@/lib/moim/server/moim-rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimRead(req, { rateKey: "invite_links", requireLogin: true });
  if (!g.ok) return g.response;
  const access = await loadMoimAccess(g.sb, moimId, g.userId);
  if (!access) return moimNotFound();
  const links = await listMoimInviteLinks(g.sb, access);
  if (!links) return NextResponse.json({ ok: false, error: "moim_forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true, links });
}

/** P4 초대 링크 만들기 — body { expiresAt: ISO | null } */
export async function POST(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "invite_link_create", limit: 10, writeKind: "none" });
  if (!g.ok) return g.response;
  const body = (await readMoimJson<{ expiresAt?: unknown }>(req)) ?? {};
  const expiresAt = typeof body.expiresAt === "string" && !Number.isNaN(Date.parse(body.expiresAt)) ? body.expiresAt : null;
  return moimRpcResponse(await moimInviteLinkCreate(g.userId, moimId, expiresAt, g.sb));
}
