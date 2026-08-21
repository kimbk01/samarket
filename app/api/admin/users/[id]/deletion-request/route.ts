import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { isAdminMemberUuidSearch } from "@/lib/admin-users/admin-member-list-query";
import { isMissingRelation } from "@/lib/admin-users/member-tab-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 회원별 탈퇴·삭제 요청 상태 (사용자 leave-request 와 동일 테이블). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const userId = id?.trim() ?? "";
  if (!userId || !isAdminMemberUuidSearch(userId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const { data, error } = await gate.sb
    .from("account_deletion_requests")
    .select("id, user_id, status, reason, confirmation_text, requested_at, processed_at, processed_by, admin_note, created_at, updated_at")
    .eq("user_id", userId)
    .order("requested_at", { ascending: false })
    .limit(20);

  if (error) {
    if (isMissingRelation(error.message, "account_deletion_requests")) {
      return NextResponse.json({ ok: true, items: [], openRequest: null });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const items = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id ?? ""),
    userId: String(row.user_id ?? userId),
    status: String(row.status ?? ""),
    reason: typeof row.reason === "string" ? row.reason : null,
    requestedAt: String(row.requested_at ?? ""),
    processedAt: typeof row.processed_at === "string" ? row.processed_at : null,
    processedBy: typeof row.processed_by === "string" ? row.processed_by : null,
    adminNote: typeof row.admin_note === "string" ? row.admin_note : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  }));

  const openRequest =
    items.find((item) => item.status === "requested" || item.status === "processing") ?? null;

  return NextResponse.json({ ok: true, items, openRequest });
}
