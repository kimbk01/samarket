import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  communityPostImagePathFromUrl,
  findDiscardableCommunityImages,
  removeCommunityPostImageOriginals,
} from "@/lib/community/community-post-image-gc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_URLS = 20;

/**
 * 작성 취소·등록 후 안 쓴 사진 정리 (Owner 승인 ③ 2026-10-31).
 * 본인 폴더 · 올린 지 24시간 이내 · 어떤 글·기능에서도 참조 안 됨 — 셋 다 맞는 원본(+파생 3개)만 지운다.
 * 다른 글에서 쓰는 사진·남의 사진·오래된 사진은 요청해도 지우지 않는다.
 */
export async function POST(req: Request) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  let body: { urls?: unknown };
  try {
    body = (await req.json()) as { urls?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const urls = Array.isArray(body.urls) ? body.urls.slice(0, MAX_URLS) : [];
  const paths = [
    ...new Set(
      urls
        .map((u) => (typeof u === "string" ? communityPostImagePathFromUrl(u) : null))
        .filter((p): p is string => Boolean(p) && p!.startsWith(`${auth.userId}/community/`))
    ),
  ];
  if (!paths.length) return NextResponse.json({ ok: true, removed: 0 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }
  const found = await findDiscardableCommunityImages(sb, auth.userId, paths);
  if (!found.ok) {
    console.error("[community/upload-image/discard] check failed", found.error);
    return NextResponse.json({ ok: false, error: "check_failed" }, { status: 500 });
  }
  const res = await removeCommunityPostImageOriginals(sb, found.names);
  if (res.failed.length) console.error("[community/upload-image/discard] remove failed", res.failed);
  return NextResponse.json({ ok: res.failed.length === 0, removed: found.names.length - res.failed.length });
}
