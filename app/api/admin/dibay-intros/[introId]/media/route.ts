import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { listDibayIntroMedia, signDibayIntroMediaUpload } from "@/lib/dibay-intro/media-store";
import { dibayIntroApiError } from "@/lib/dibay-intro/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ introId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { introId } = await ctx.params;
  try {
    const media = await listDibayIntroMedia(introId);
    return NextResponse.json({ ok: true, media });
  } catch (error) {
    return dibayIntroApiError(error);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { introId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    originalName?: string;
    mime?: string;
    byteSize?: number;
  };
  try {
    const signed = await signDibayIntroMediaUpload({
      introId,
      userId: admin.userId,
      originalName: String(body.originalName ?? "upload"),
      mime: String(body.mime ?? ""),
      byteSize: Number(body.byteSize ?? 0),
    });
    return NextResponse.json({ ok: true, ...signed });
  } catch (error) {
    return dibayIntroApiError(error, "sign_failed");
  }
}
