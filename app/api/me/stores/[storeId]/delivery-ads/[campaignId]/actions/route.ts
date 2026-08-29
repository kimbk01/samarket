import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import {
  loadOwnerSponsoredCampaign,
  transitionOwnerSponsoredCampaign,
} from "@/lib/stores/advertising/owner-store-sponsored-writer";
import {
  ownerActionTargetLifecycle,
  type OwnerCampaignAction,
} from "@/lib/stores/advertising/owner-store-sponsored-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set<OwnerCampaignAction>(["submit", "resubmit", "pause", "resume", "end"]);

function statusForError(error: string): number {
  switch (error) {
    case "forbidden":
      return 403;
    case "campaign_not_found":
      return 404;
    case "illegal_transition":
    case "duplicate_submit":
      return 409;
    case "db_error":
      return 500;
    default:
      return 400;
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ storeId: string; campaignId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId, campaignId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const cid = typeof campaignId === "string" ? campaignId.trim() : "";
  if (!sid || !cid) return NextResponse.json({ ok: false, error: "missing_ids" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = String(body.action ?? "").trim() as OwnerCampaignAction;
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const to = ownerActionTargetLifecycle(action);
  if (!to) return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const loaded = await loadOwnerSponsoredCampaign(sb, cid, userId);
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error }, { status: statusForError(loaded.error) });
  }
  if (loaded.row.storeId !== sid) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  // PAUSED_ADMIN resume must fail via transition authority
  const actionLabel =
    action === "submit"
      ? "submitted"
      : action === "resubmit"
        ? "resubmitted"
        : action === "pause"
          ? "paused_owner"
          : action === "resume"
            ? "resumed_owner"
            : "ended_owner";

  const result = await transitionOwnerSponsoredCampaign(sb, {
    campaignId: cid,
    ownerUserId: userId,
    to,
    actionLabel,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: statusForError(result.error) });
  }
  return NextResponse.json({ ok: true, campaign: result.row });
}
