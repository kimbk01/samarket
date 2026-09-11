import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Legacy REFERENCE_SUMMARY import — retired. Canonical path: crawl items → publish. */
export async function POST(_req: Request, _ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  return NextResponse.json(
    {
      ok: false,
      error: "MANUAL_IMPORT_RETIRED",
      detail:
        "TEST→per-item import is retired from product authority. Use durable crawl items + policy-gated publish.",
    },
    { status: 410 }
  );
}
