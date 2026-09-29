import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { listIntroMedia } from "@/lib/intro/media/service";
import { toClientFailure } from "@/lib/intro/media/failure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/intro/media — Admin Media Library list (operator UX). */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json(
      { ok: false, error: "server_misconfigured" },
      { status: 503 },
    );
  }

  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 100;
  const q = req.nextUrl.searchParams.get("q") ?? undefined;

  try {
    const items = await listIntroMedia({ sb, limit, q });
    return NextResponse.json({ ok: true as const, items });
  } catch (err) {
    const f = toClientFailure(err);
    return NextResponse.json({ ok: false, ...f }, { status: 500 });
  }
}
