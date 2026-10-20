/**
 * 공용 관리자 처리 (원래 app/api/admin/users/[id]/trade/route.ts 본문 그대로 이동). 서버 전용.
 * 원래 라우트(권한 키 `users`)와 거래 Admin 라우트(O-2 활성 관리자 전원)가 같은 처리를 공유한다.
 */
import "server-only";
import type { SharedAdminHandlerGate } from "@/lib/admin/shared-handlers/shared-admin-handler-gate";
import { NextRequest, NextResponse } from "next/server";
import { isAdminMemberUuidSearch } from "@/lib/admin-users/admin-member-list-query";
import { loadMemberTradeTab, type MemberTradeSection } from "@/lib/admin-users/member-trade-tab";
import { parseAdminMemberDomainPage } from "@/lib/admin-users/member-tab-query";


const SECTIONS = new Set<MemberTradeSection>(["listings", "buyer"]);

export async function handleAdminMemberTradeGet(
  gate: SharedAdminHandlerGate,
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {

  const { id } = await params;
  const userId = id?.trim() ?? "";
  if (!userId || !isAdminMemberUuidSearch(userId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const sectionRaw = req.nextUrl.searchParams.get("section")?.trim() || "listings";
  const section = SECTIONS.has(sectionRaw as MemberTradeSection) ? (sectionRaw as MemberTradeSection) : "listings";
  const page = parseAdminMemberDomainPage(req.nextUrl.searchParams);
  const payload = await loadMemberTradeTab(gate.sb, userId, { section, ...page });
  return NextResponse.json({ ok: true, ...payload });
}
