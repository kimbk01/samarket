import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { publishDibayIntro } from "@/lib/dibay-intro/admin-store";
import { dibayIntroApiError } from "@/lib/dibay-intro/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ introId: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { introId } = await ctx.params;
  try {
    const result = await publishDibayIntro(introId, admin.userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return dibayIntroApiError(error);
  }
}
