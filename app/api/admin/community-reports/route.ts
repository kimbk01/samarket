import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { NextResponse } from "next/server";
import { listCommunityReportsForAdmin } from "@/lib/community-feed/admin-community-reports";
import { mapCommunityReportsToReports } from "@/lib/admin-reports/map-community-reports";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 관리자: 동네생활 피드 신고 목록(JSON) — 통합 신고함 병합용 */
export async function GET() {
  const admin = await requireCommunityAdmin("moderation");
  if (!admin.ok) return admin.response;

  try {
    const rows = await listCommunityReportsForAdmin(300);
    const ids = [...new Set(rows.map((r) => r.reporter_id).filter(Boolean))] as string[];
    const nicknameById: Record<string, string> = {};
    if (ids.length > 0) {
      // C-44: 신고자 표시는 profiles(닉네임 | DIBAY ID) 기준 — 레거시 test_users 사용 금지
      const identities = await loadAdminMemberIdentityMap(admin.sb, ids);
      for (const id of ids) {
        const identity = identities.get(id);
        if (identity) nicknameById[id] = formatAdminMemberLabel(identity);
      }
    }
    const reports = mapCommunityReportsToReports(rows, nicknameById);
    return NextResponse.json({ ok: true, reports });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
