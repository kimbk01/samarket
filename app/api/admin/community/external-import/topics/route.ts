import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { listAllCommunityTopicsForAdmin } from "@/lib/community-topics/server";
import { isPhilifeNeighborhoodWriteEligibleRow } from "@/lib/neighborhood/philife-topic-slug-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const topics = await listAllCommunityTopicsForAdmin();
  const writeEligible = topics.filter(
    (t) =>
      t.is_active !== false &&
      t.is_visible !== false &&
      isPhilifeNeighborhoodWriteEligibleRow(Boolean(t.allow_meetup), Boolean(t.is_feed_sort), String(t.slug || ""))
  );
  return NextResponse.json({
    ok: true,
    topics: writeEligible.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      sectionId: t.section_id,
    })),
  });
}
