import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { processDibayIntroMedia } from "@/lib/dibay-intro/media-store";
import { dibayIntroApiError } from "@/lib/dibay-intro/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ introId: string; mediaId: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { introId, mediaId } = await ctx.params;
  try {
    const media = await processDibayIntroMedia(introId, mediaId);
    return NextResponse.json({ ok: true, media });
  } catch (error) {
    return dibayIntroApiError(error, "process_failed");
  }
}
