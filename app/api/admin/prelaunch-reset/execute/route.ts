import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { executePrelaunchReset } from "@/lib/admin/prelaunch-reset/execute";
import { resolvePrelaunchResetEnvGate } from "@/lib/admin/prelaunch-reset/environment";
import type { PrelaunchResetPreset } from "@/lib/admin/prelaunch-reset/types";
import { PRELAUNCH_RESET_PRESETS } from "@/lib/admin/prelaunch-reset/presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRESETS = new Set(Object.keys(PRELAUNCH_RESET_PRESETS));

/**
 * POST /api/admin/prelaunch-reset/execute
 * Fail-closed on Production. Requires PRELAUNCH_RESET_ENABLED + MASTER + typed confirmation.
 */
export async function POST(req: Request) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;

  const envGate = resolvePrelaunchResetEnvGate();
  if (!envGate.executeAllowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "execute_forbidden",
        reasons: envGate.reasons,
        productionExecuteForbidden: true,
      },
      { status: 403 }
    );
  }

  let body: {
    preset?: string;
    planId?: string;
    expectedHash?: string;
    typedConfirmation?: string;
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
  const planId = String(body.planId ?? "").trim();
  const expectedHash = String(body.expectedHash ?? "").trim();
  const typedConfirmation = String(body.typedConfirmation ?? "");
  if (!PRESETS.has(preset) || !planId || !expectedHash) {
    return NextResponse.json({ ok: false, error: "invalid_execute_payload" }, { status: 400 });
  }

  const result = await executePrelaunchReset({
    sb: auth.sb,
    actorUserId: auth.actor.userId,
    preset,
    planId,
    expectedHash,
    typedConfirmation,
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

  const status =
    result.overall === "BLOCKED" ? 409 : result.overall === "FAIL" ? 500 : 200;

  return NextResponse.json(
    {
      ok: result.ok && result.overall !== "FAIL",
      overall: result.overall,
      plan: result.plan,
      phases: result.phases,
      note:
        result.overall === "PARTIAL"
          ? "DB may have changed; Storage/Auth phases incomplete — not full reset success"
          : undefined,
    },
    { status }
  );
}
