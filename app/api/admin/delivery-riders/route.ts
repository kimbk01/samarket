import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const sbAny = sb as any;
  const { data, error } = await sbAny.rpc("admin_delivery_riders_operations_snapshot");
  if (error) {
    const msg = String(error.message ?? "");
    if (/function .* does not exist|Could not find the function/i.test(msg)) {
      return NextResponse.json(
        { error: "rpc_missing", hint: "Apply migration 20260517120000_delivery_riders_admin_center" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: msg.slice(0, 240) }, { status: 500 });
  }

  return NextResponse.json(data ?? { riders: [], unassigned_deliveries: [] });
}
