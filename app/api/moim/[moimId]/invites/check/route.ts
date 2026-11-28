import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead, moimBadRequest, moimNotFound, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { checkMoimInviteCandidates, loadMoimAccess, moimCanMap, MOIM_INVITE_CHECK_MAX } from "@/lib/moim/server/moim-queries.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

/**
 * R5 C2: 친구 초대 목록 확인 — body { userIds: string[] (≤300) } → { members, unavailable }.
 * 권한 = send_invite(아니면 403). unavailable = 가입 신청 중·차단(이유는 나누지 않는다 — 차단 사실을 드러내지 않음, 계약 P4).
 * 읽기만 한다(쓰기 없음). 친구 목록을 받은 뒤 화면이 1회 부른다.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimRead(req, { rateKey: "invite_check", limit: 30 });
  if (!g.ok) return g.response;
  const body = await readMoimJson<{ userIds?: unknown }>(req);
  if (!Array.isArray(body?.userIds) || body.userIds.length > MOIM_INVITE_CHECK_MAX) return moimBadRequest();
  const ids = body.userIds.map((v) => (typeof v === "string" ? requireUuid(v) : null)).filter((v): v is string => !!v);
  const access = await loadMoimAccess(g.sb, moimId, g.userId);
  if (!access) return moimNotFound();
  if (!moimCanMap(access).send_invite) return NextResponse.json({ ok: false, error: "moim_forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true, ...(await checkMoimInviteCandidates(g.sb, moimId, ids)) });
}
