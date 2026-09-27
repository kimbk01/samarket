import { NextRequest, NextResponse } from "next/server";
import { requireIntroAdminContext } from "@/lib/startup/intro-v2/admin-api-context";
import { listLiveIntroResolverCandidates } from "@/lib/startup/intro-v2/admin-service";
import {
  parseIntroResolverPreviewFixture,
  previewIntroResolver,
} from "@/lib/startup/intro-v2/admin-resolver-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = await requireIntroAdminContext();
  if (!ctx.ok) return ctx.response;
  const body = await req.json().catch(() => ({}));
  const fixture = parseIntroResolverPreviewFixture(body);
  const candidates = await listLiveIntroResolverCandidates(ctx.sb);
  const preview = previewIntroResolver(candidates, fixture);
  return NextResponse.json({
    ok: true,
    fixture,
    preview,
    candidateCount: candidates.length,
  });
}
