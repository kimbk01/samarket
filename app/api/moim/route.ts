import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead, guardMoimWrite, moimBadRequest, moimRpcResponse, readMoimJson } from "@/lib/moim/server/moim-route-guard.server";
import { listLocalMoims, listMyMoims, loadViewerMoimArea } from "@/lib/moim/server/moim-queries.server";
import { moimCreate, type MoimCreateInput } from "@/lib/moim/server/moim-rpc.server";
import { isUuidString } from "@/lib/shared/uuid-string";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AREA_UNAVAILABLE = () => NextResponse.json({ ok: false, error: "moim_unknown" }, { status: 503 });

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
  const area = await loadViewerMoimArea(g.sb, g.userId);
  /** 주소 조회 실패를 「주소 없음」으로 보이지 않게 — 오류 화면(다시 시도) */
  if (area?.dto.status === "unavailable") return AREA_UNAVAILABLE();
  const category = sp.get("category");
  const page = await listLocalMoims(g.sb, g.userId, {
    lguId: area?.lguId ?? null,
    categoryId: category && isUuidString(category) ? category : null,
    q: sp.get("q"),
    before: sp.get("before"),
    limit: Number(sp.get("limit") ?? 20) || 20,
  });
  return NextResponse.json({
    ok: true,
    ...page,
    hasAddress: area?.dto.status === "ok",
    /** 주소 안내 문구 구분 — 대표 주소 없음 / 시·군 미확정 (로그인 안 함 = no_address) */
    areaStatus: area?.dto.status ?? "no_address",
  });
}

/** P1 모임 개설 */
export async function POST(req: NextRequest) {
  const g = await guardMoimWrite(req, { rateKey: "create", limit: 6, phone: true });
  if (!g.ok) return g.response;
  const body = await readMoimJson<Partial<MoimCreateInput>>(req);
  if (!body || typeof body.name !== "string" || typeof body.categoryId !== "string") return moimBadRequest();
  /** 모임 동네 = 대표 주소의 시/군 (주소 위치 단일 정의 — 저장 칸이 비어 있어도 주소 문장으로 판정) */
  const area = await loadViewerMoimArea(g.sb, g.userId);
  if (!area || area.dto.status === "unavailable") return AREA_UNAVAILABLE();
  if (area.dto.status === "no_address") return moimRpcResponse({ ok: false, error: "moim_address_required" });
  if (area.dto.status === "city_unresolved") return moimRpcResponse({ ok: false, error: "moim_address_city_unresolved" });
  const result = await moimCreate(
    g.userId,
    {
      name: body.name,
      intro: typeof body.intro === "string" ? body.intro : "",
      categoryId: body.categoryId,
      topicLabel: typeof body.topicLabel === "string" ? body.topicLabel.slice(0, 60) : null,
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
    g.sb,
    { masterLguId: area.lguId }
  );
  return moimRpcResponse(result);
}
