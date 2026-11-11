import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead, guardMoimWrite, moimBadRequest, moimRpcResponse, readMoimJson } from "@/lib/moim/server/moim-route-guard.server";
import { listLocalMoims, listMyMoims, loadViewerMoimLgu } from "@/lib/moim/server/moim-queries.server";
import { moimCreate, type MoimCreateInput } from "@/lib/moim/server/moim-rpc.server";
import { isUuidString } from "@/lib/shared/uuid-string";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 모임 목록 — scope=mine(내 모임, 로그인) | local(우리 동네, 대표 주소 시/군) */
export async function GET(req: NextRequest) {
  const g = await guardMoimRead(req, { rateKey: "list" });
  if (!g.ok) return g.response;
  const sp = req.nextUrl.searchParams;
  const scope = sp.get("scope") === "mine" ? "mine" : "local";
  if (scope === "mine") {
    if (!g.userId) return NextResponse.json({ ok: true, items: [], nextBefore: null });
    return NextResponse.json({ ok: true, items: await listMyMoims(g.sb, g.userId), nextBefore: null });
  }
  const lguId = await loadViewerMoimLgu(g.sb, g.userId);
  const category = sp.get("category");
  const page = await listLocalMoims(g.sb, g.userId, {
    lguId,
    categoryId: category && isUuidString(category) ? category : null,
    q: sp.get("q"),
    before: sp.get("before"),
    limit: Number(sp.get("limit") ?? 20) || 20,
  });
  return NextResponse.json({ ok: true, ...page, hasAddress: !!lguId });
}

/** P1 모임 개설 */
export async function POST(req: NextRequest) {
  const g = await guardMoimWrite(req, { rateKey: "create", limit: 6, phone: true });
  if (!g.ok) return g.response;
  const body = await readMoimJson<Partial<MoimCreateInput>>(req);
  if (!body || typeof body.name !== "string" || typeof body.categoryId !== "string") return moimBadRequest();
  const result = await moimCreate(
    g.userId,
    {
      name: body.name,
      intro: typeof body.intro === "string" ? body.intro : "",
      categoryId: body.categoryId,
      joinMode: body.joinMode === "approval" ? "approval" : "instant",
      capacity: typeof body.capacity === "number" ? body.capacity : null,
      coverImageUrl: typeof body.coverImageUrl === "string" ? body.coverImageUrl : null,
      ageMinBirthYear: typeof body.ageMinBirthYear === "number" ? body.ageMinBirthYear : null,
      ageMaxBirthYear: typeof body.ageMaxBirthYear === "number" ? body.ageMaxBirthYear : null,
      questions: Array.isArray(body.questions) ? body.questions.filter((q): q is string => typeof q === "string").slice(0, 5) : [],
      nickname: typeof body.nickname === "string" ? body.nickname : undefined,
      avatarUrl: typeof body.avatarUrl === "string" ? body.avatarUrl : null,
      bio: typeof body.bio === "string" ? body.bio : "",
    },
    g.sb
  );
  return moimRpcResponse(result);
}
