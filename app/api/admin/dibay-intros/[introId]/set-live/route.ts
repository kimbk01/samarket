import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { setDibayIntroLive } from "@/lib/dibay-intro/admin-store";
import { persistLiveIntroPack } from "@/lib/dibay-intro/pack/persist-live-pack";
import { dibayIntroApiError } from "@/lib/dibay-intro/api-error";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ introId: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { introId } = await ctx.params;
  try {
    const result = await setDibayIntroLive(introId, admin.userId);
    const packed = await persistLiveIntroPack();
    const db = tryCreateSupabaseServiceClient();
    if (db) {
      await db.from("dibay_intro_revisions").update({ engine_hash: packed.engineHash }).eq("id", result.revisionId);
    }
    return NextResponse.json({ ok: true, ...result, engineHash: packed.engineHash });
  } catch (error) {
    return dibayIntroApiError(error);
  }
}
