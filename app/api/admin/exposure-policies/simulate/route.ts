import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import {
  getExposureScorePolicyBySurfaceFromDb,
  insertExposurePolicyLog,
} from "@/lib/exposure/exposure-score-policies-db";
import { getDefaultExposureScorePolicyBySurface } from "@/lib/exposure/exposure-score-policy-defaults";
import { computeAndSortCandidates } from "@/lib/exposure/exposure-score-utils";
import type { ExposureCandidate, ExposureSurface } from "@/lib/types/exposure";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const body = (await req.json().catch(() => ({}))) as { surface?: ExposureSurface };
  const surface = body.surface ?? "home";

  const sb = tryCreateSupabaseServiceClient();
  const policy =
    (sb ? await getExposureScorePolicyBySurfaceFromDb(sb, surface) : null) ??
    getDefaultExposureScorePolicyBySurface(surface);

  if (!policy) {
    return NextResponse.json({ ok: false, error: "policy_not_found" }, { status: 404 });
  }

  let candidates: ExposureCandidate[] = [];
  if (sb) {
    const { data: rows } = await sb
      .from(POSTS_TABLE_READ)
      .select("id, title, user_id, price, status, region, city, view_count, created_at")
      .not("status", "eq", "hidden")
      .not("status", "eq", "deleted")
      .order("created_at", { ascending: false })
      .limit(40);

    const userIds = [...new Set((rows ?? []).map((r) => String((r as { user_id?: string }).user_id ?? "")).filter(Boolean))];
    const nickById = new Map<string, string>();
    if (userIds.length) {
      const { data: profs } = await sb
        .from("profiles")
        .select("id, display_name, nickname, username")
        .in("id", userIds);
      for (const p of profs ?? []) {
        const id = String((p as { id?: string }).id ?? "");
        const label = labelFromDisplayAndUsername(
          String((p as { display_name?: string }).display_name ?? (p as { nickname?: string }).nickname ?? ""),
          String((p as { username?: string }).username ?? "")
        );
        if (id) nickById.set(id, label);
      }
    }

    candidates = (rows ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const uid = String(row.user_id ?? "");
      return {
        id: String(row.id ?? ""),
        title: String(row.title ?? ""),
        sellerId: uid,
        sellerNickname: nickById.get(uid) ?? "",
        memberType: "normal" as const,
        businessProfileId: null,
        isBusinessItem: false,
        price: Number(row.price ?? 0),
        status: (String(row.status ?? "active") as ExposureCandidate["status"]),
        likesCount: 0,
        chatCount: 0,
        viewCount: Number(row.view_count ?? 0),
        createdAt: String(row.created_at ?? ""),
        bumpedAt: null,
        region: String(row.region ?? ""),
        city: String(row.city ?? ""),
        barangay: "",
        distance: 0,
        adPromotionStatus: "none",
        pointPromotionStatus: "none",
        shopFeaturedStatus: "none",
      };
    });
  }

  const results = computeAndSortCandidates(candidates, policy, surface, null).slice(0, 20);
  // ExposureResultTable 계약: { candidate, result }[]

  if (sb) {
    const { data: prof } = await sb
      .from("profiles")
      .select("display_name, nickname, username")
      .eq("id", admin.userId)
      .maybeSingle();
    const nick = labelFromDisplayAndUsername(
      String(prof?.display_name ?? prof?.nickname ?? ""),
      String(prof?.username ?? "")
    );
    await insertExposurePolicyLog(sb, {
      policyId: policy.id,
      surface,
      actionType: "simulate",
      adminId: admin.userId,
      adminNickname: nick || "admin",
      note: `시뮬레이션 ${results.length}건`,
    });
  }

  return NextResponse.json({ ok: true, results, policy, candidateCount: candidates.length });
}
