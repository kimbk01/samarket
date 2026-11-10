import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { isUuid } from "@/lib/community-messenger/contacts/contacts-contract";
import { loadContactsMemberAdminView } from "@/lib/community-messenger/contacts/contacts-service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ userId: string }> };

/** GET — 회원 상세 연락처 동기화 상태 (동의·철회 이력 · 기기 출처 · 숨긴 추천 수 · 가입 안내 수). 번호·이름·변환값 없음 */
export async function GET(_req: Request, { params }: Ctx) {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;
  const { userId } = await params;
  if (!isUuid(userId)) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const view = await loadContactsMemberAdminView(gate.sb, userId);
  return NextResponse.json({ ok: true, ...view }, { headers: { "Cache-Control": "no-store" } });
}
