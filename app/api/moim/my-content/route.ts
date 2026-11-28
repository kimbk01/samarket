import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead, moimBadRequest, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { listMyMoimContent } from "@/lib/moim/server/moim-queries.server";
import type { MoimMyContentType } from "@/lib/moim/moim-api-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: readonly MoimMyContentType[] = ["post", "comment", "album"];

/**
 * R5 B1 · E8 · D-36: 내가 쓴 글·댓글·사진 — `?type=post|comment|album&moim=&before=`.
 * 로그인 필수. 작성자 = 나, 숨김 포함, 삭제된 모임 제외. 20개 쪽(시각 커서). 지우기는 기존 DELETE 라우트.
 */
export async function GET(req: NextRequest) {
  const g = await guardMoimRead(req, { rateKey: "my_content", limit: 60 });
  if (!g.ok) return g.response;
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") as MoimMyContentType | null;
  if (!type || !TYPES.includes(type)) return moimBadRequest();
  const moimRaw = sp.get("moim");
  const moimId = moimRaw ? requireUuid(moimRaw) : null;
  if (moimRaw && !moimId) return moimBadRequest();
  const page = await listMyMoimContent(g.sb, g.userId!, { type, moimId, before: sp.get("before") });
  return NextResponse.json({ ok: true, ...page });
}
