import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { resolveCommunityWriteEditorRollout } from "@/lib/philife/write-editor/write-editor-flag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 커뮤니티 글쓰기 새 편집기(WYSIWYG) 노출 판정.
 * - 기본 `admin`: 일반 회원 비노출, 관리자 계정만 글쓰기 화면에서 직접 켜서 검증.
 * - `on` 은 Owner 공개 승인 후 env 로만 켠다. `off` 는 관리자 검증도 차단.
 */
export async function GET() {
  const rollout = resolveCommunityWriteEditorRollout(process.env.COMMUNITY_WYSIWYG_EDITOR);
  const canOptIn = rollout === "admin" ? await isRouteAdmin() : false;
  return NextResponse.json(
    { ok: true, rollout, canOptIn },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
