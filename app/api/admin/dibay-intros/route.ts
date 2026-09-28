import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { createDibayIntro, listDibayIntros } from "@/lib/dibay-intro/admin-store";
import { dibayIntroApiError } from "@/lib/dibay-intro/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const items = await listDibayIntros();
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return dibayIntroApiError(error);
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const body = (await req.json().catch(() => ({}))) as { title?: string };
  try {
    const record = await createDibayIntro(admin.userId, body.title);
    return NextResponse.json({ ok: true, intro: record });
  } catch (error) {
    return dibayIntroApiError(error);
  }
}
