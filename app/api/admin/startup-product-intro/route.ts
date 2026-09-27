import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { loadProductIntroFromDb } from "@/lib/startup/product-intro-db";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const loaded = await loadProductIntroFromDb(sb);
  if (!loaded.ok) {
    if (loaded.reason === "missing_table") {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: loaded.message ?? "error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true as const, source: loaded.source, config: loaded.config });
}

export async function PUT(_req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json(
    {
      ok: false,
      error: "operator_writer_moved",
      href: "/admin/intro",
    },
    { status: 409 }
  );
}
