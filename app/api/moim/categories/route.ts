import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead } from "@/lib/moim/server/moim-route-guard.server";
import { listMoimCategories } from "@/lib/moim/server/moim-queries.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = await guardMoimRead(req, { rateKey: "categories" });
  if (!g.ok) return g.response;
  return NextResponse.json({ ok: true, categories: await listMoimCategories(g.sb) });
}
