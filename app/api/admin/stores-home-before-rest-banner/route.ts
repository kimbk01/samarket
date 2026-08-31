import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import {
  loadResolvedCompositionPolicy,
  upsertCompositionPolicyOverridesWithCas,
} from "@/lib/stores/composition/stores-composition-policy-db";
import { parseExpectedCompositionPolicyRevision } from "@/lib/stores/composition/stores-composition-policy-concurrency";
import { validateCompositionPolicyBatch } from "@/lib/stores/composition/stores-composition-policy-validation";
import { homeBannerBeforeRestPolicyEnabled } from "@/lib/stores/composition/stores-composition-insertion-live";
import { STAGE2_HOME_BANNER_BEFORE_REST_SLOT } from "@/lib/stores/advertising/delivery-ad-stage2-surface-contract";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — Stage 2 HOME before-rest Banner physical enable (composition-owned). */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    const { rows, revision } = await loadResolvedCompositionPolicy(sb, "home");
    return NextResponse.json({
      ok: true,
      enabled: homeBannerBeforeRestPolicyEnabled(rows),
      slot: STAGE2_HOME_BANNER_BEFORE_REST_SLOT,
      revision,
      humanLabelKo: "배달 홈 매장 목록 위 배너",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "load_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * PUT — toggle HOME physical Banner slot only.
 * Does not touch native rest_stores / homePaidAdInsertion.
 */
export async function PUT(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "invalid_enabled" }, { status: 400 });
  }
  const expectedRevision = parseExpectedCompositionPolicyRevision(body.expectedRevision);
  if (expectedRevision === "invalid") {
    return NextResponse.json({ ok: false, error: "invalid_expected_revision" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  try {
    const current = await loadResolvedCompositionPolicy(sb, "home");
    const compositionRows = current.rows.map((r) => ({
      surface: "home" as const,
      slot: r.slot,
      contentType: r.contentType,
      enabled:
        r.slot === STAGE2_HOME_BANNER_BEFORE_REST_SLOT ? body.enabled === true : r.enabled,
      order: r.order,
      max: r.max,
      interval: { consumed: false as const, reason: "NOT_CONSUMED" as const },
    }));

    const validationError = validateCompositionPolicyBatch("home", compositionRows);
    if (validationError) {
      return NextResponse.json(
        { ok: false, error: validationError.code, detail: validationError },
        { status: 400 }
      );
    }

    const cas = await upsertCompositionPolicyOverridesWithCas(
      sb,
      "home",
      compositionRows,
      { userId, nickname: userId.slice(0, 8) },
      expectedRevision
    );
    if (!cas.ok) {
      if (cas.error === "stale_revision") {
        return NextResponse.json(
          {
            ok: false,
            error: "stale_revision",
            currentRevision: "currentRevision" in cas ? cas.currentRevision : -1,
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ ok: false, error: cas.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      enabled: body.enabled === true,
      revision: cas.revision,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "save_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
