import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { buildPrelaunchResetPlan } from "@/lib/admin/prelaunch-reset/planner";
import { resolvePrelaunchResetEnvGate } from "@/lib/admin/prelaunch-reset/environment";
import type { PrelaunchResetPreset } from "@/lib/admin/prelaunch-reset/types";
import { PRELAUNCH_RESET_PRESETS } from "@/lib/admin/prelaunch-reset/presets";
import { appendAuditLog } from "@/lib/audit/append-audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRESETS = new Set(Object.keys(PRELAUNCH_RESET_PRESETS));

/** POST /api/admin/prelaunch-reset/dry-run — impact analysis only. */
export async function POST(req: Request) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;

  const envGate = resolvePrelaunchResetEnvGate();
  if (!envGate.dryRunAllowed) {
    return NextResponse.json(
      { ok: false, error: "dry_run_forbidden", reasons: envGate.reasons },
      { status: 403 }
    );
  }

  let body: {
    preset?: string;
    memberIds?: string[];
    storeIds?: string[];
    contentIds?: string[];
    deliveryAdCampaignIds?: string[];
    commentIds?: string[];
    supportCaseIds?: string[];
    feedAdCampaignIds?: string[];
    feedAdRequestIds?: string[];
    popupCampaignIds?: string[];
    popupRequestIds?: string[];
    couponCampaignIds?: string[];
    chatRoomIds?: string[];
    selectedScopes?: string[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const preset = String(body.preset ?? "").trim() as PrelaunchResetPreset;
  if (!PRESETS.has(preset)) {
    return NextResponse.json({ ok: false, error: "invalid_preset" }, { status: 400 });
  }

  const plan = await buildPrelaunchResetPlan({
    sb: auth.sb,
    actorUserId: auth.actor.userId,
    preset,
    selector: {
      memberIds: body.memberIds,
      storeIds: body.storeIds,
      contentIds: body.contentIds,
      deliveryAdCampaignIds: body.deliveryAdCampaignIds,
      commentIds: body.commentIds,
      supportCaseIds: body.supportCaseIds,
      feedAdCampaignIds: body.feedAdCampaignIds,
      feedAdRequestIds: body.feedAdRequestIds,
      popupCampaignIds: body.popupCampaignIds,
      popupRequestIds: body.popupRequestIds,
      couponCampaignIds: body.couponCampaignIds,
      chatRoomIds: body.chatRoomIds,
    },
    selectedScopes: body.selectedScopes,
  });

  await appendAuditLog(auth.sb, {
    actor_type: "admin",
    actor_id: auth.actor.userId,
    target_type: "prelaunch_reset",
    target_id: plan.planId,
    action: "prelaunch_reset_dry_run",
    after_json: {
      planHash: plan.planHash,
      counts: plan.counts,
      blockers: plan.blockers,
      environment: plan.environment,
    },
  });

  return NextResponse.json({
    ok: true,
    envGate,
    plan,
    uiCopy: PRELAUNCH_RESET_PRESETS[preset],
  });
}
