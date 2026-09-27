import { NextRequest, NextResponse } from "next/server";
import { requireIntroAdminContext } from "@/lib/startup/intro-v2/admin-api-context";
import {
  resolveIntroEntitiesByIds,
  searchIntroEntities,
  type IntroEntityKind,
} from "@/lib/startup/intro-v2/admin-entity-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set<IntroEntityKind>(["STORE", "PRODUCT", "LISTING", "POST", "CHAT_ROOM", "EVENT"]);

export async function GET(req: NextRequest) {
  const ctx = await requireIntroAdminContext();
  if (!ctx.ok) return ctx.response;
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") as IntroEntityKind | null;
  const q = searchParams.get("q") ?? "";
  const idsRaw = searchParams.get("ids") ?? "";
  if (!kind || !KINDS.has(kind)) {
    return NextResponse.json({ ok: false, error: "kind_invalid" }, { status: 400 });
  }
  const ids = idsRaw.split(",").map((id) => id.trim()).filter(Boolean);
  const items = ids.length > 0
    ? await resolveIntroEntitiesByIds(ctx.sb, kind, ids)
    : await searchIntroEntities(ctx.sb, kind, q);
  return NextResponse.json({ ok: true, items });
}
