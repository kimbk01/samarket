import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { runBoardDiagnostic } from "@/lib/community-crawler/core/board-diagnostic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let body: { list_url?: string; media_required?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const listUrl = (body.list_url ?? "").trim();
  if (!listUrl) {
    return NextResponse.json({ ok: false, error: "list_url_required" }, { status: 400 });
  }

  try {
    const diagnostic = await runBoardDiagnostic({
      listUrl,
      mediaRequired: body.media_required !== false,
    });
    return NextResponse.json({ ok: true, diagnostic });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
