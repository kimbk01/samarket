import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  createReplacementRule,
  listReplacementRules,
} from "@/lib/external-board-import/policy/replacement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sourceId = req.nextUrl.searchParams.get("sourceId")?.trim();
  if (!sourceId) {
    return NextResponse.json({ ok: false, error: "sourceId_required" }, { status: 400 });
  }
  try {
    const sb = getSupabaseServer();
    const rules = await listReplacementRules(sb, sourceId);
    return NextResponse.json({ ok: true, rules });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const sourceId = String(body.sourceId ?? "").trim();
    const fromText = String(body.fromText ?? "");
    if (!sourceId || !fromText) {
      return NextResponse.json({ ok: false, error: "sourceId_and_fromText_required" }, { status: 400 });
    }
    const sb = getSupabaseServer();
    const rule = await createReplacementRule(sb, {
      sourceId,
      fromText,
      toText: body.toText != null ? String(body.toText) : "",
      applyTitle: body.applyTitle != null ? Boolean(body.applyTitle) : true,
      applyBody: body.applyBody != null ? Boolean(body.applyBody) : true,
      priority: body.priority != null ? Number(body.priority) : 100,
    });
    return NextResponse.json({ ok: true, rule });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}
