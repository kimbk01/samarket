import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import type { StoresCompositionSurface } from "@/lib/stores/composition/stores-composition-contract";
import { STORES_COMPOSITION_SURFACES } from "@/lib/stores/composition/stores-composition-contract";
import {
  loadResolvedCompositionPolicy,
  upsertCompositionPolicyOverridesWithCas,
} from "@/lib/stores/composition/stores-composition-policy-db";
import { parseExpectedCompositionPolicyRevision } from "@/lib/stores/composition/stores-composition-policy-concurrency";
import type { CompositionPolicyCasResult } from "@/lib/stores/composition/stores-composition-policy-concurrency";
import {
  detectForbiddenCompositionWriteFields,
  validateCompositionPolicyBatch,
  type StoresCompositionPolicyWriteInput,
} from "@/lib/stores/composition/stores-composition-policy-validation";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseSurface(raw: string | null): StoresCompositionSurface | null;
function parseSurface(raw: unknown): StoresCompositionSurface | null;
function parseSurface(raw: unknown): StoresCompositionSurface | null {
  if (typeof raw !== "string") return null;
  return (STORES_COMPOSITION_SURFACES as readonly string[]).includes(raw)
    ? (raw as StoresCompositionSurface)
    : null;
}

function parseRows(raw: unknown): StoresCompositionPolicyWriteInput[] | "invalid" {
  if (!Array.isArray(raw)) return "invalid";
  const out: StoresCompositionPolicyWriteInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return "invalid";
    const o = item as Record<string, unknown>;
    const interval = o.interval;
    if (!interval || typeof interval !== "object") return "invalid";
    const iv = interval as Record<string, unknown>;
    out.push({
      surface: String(o.surface ?? ""),
      slot: String(o.slot ?? ""),
      contentType: o.contentType != null ? String(o.contentType) : undefined,
      enabled: Boolean(o.enabled),
      order: Number(o.order),
      max: o.max === null ? null : Number(o.max),
      interval:
        iv.consumed === false && iv.reason === "NOT_CONSUMED"
          ? { consumed: false, reason: "NOT_CONSUMED" }
          : { consumed: true, everyN: Number(iv.everyN) },
    });
  }
  return out;
}

export async function GET(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const surface = parseSurface(req.nextUrl.searchParams.get("surface"));
  if (!surface) {
    return NextResponse.json({ ok: false, error: "invalid_surface" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  try {
    const { rows, overrides, revision } = await loadResolvedCompositionPolicy(sb, surface);
    return NextResponse.json({
      ok: true,
      surface,
      rows,
      overrideCount: overrides.length,
      revision,
      engineStatus: "live",
      rankingEditable: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "load_failed";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[admin stores-composition-policy GET]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

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

  const forbiddenField = detectForbiddenCompositionWriteFields(body);
  if (forbiddenField) {
    return NextResponse.json(
      { ok: false, error: "forbidden_field", field: forbiddenField },
      { status: 400 }
    );
  }

  const surface = parseSurface(body.surface);
  if (!surface) {
    return NextResponse.json({ ok: false, error: "invalid_surface" }, { status: 400 });
  }

  const rows = parseRows(body.rows);
  if (rows === "invalid") {
    return NextResponse.json({ ok: false, error: "invalid_rows" }, { status: 400 });
  }

  const validationError = validateCompositionPolicyBatch(surface, rows);
  if (validationError) {
    return NextResponse.json(
      { ok: false, error: validationError.code, detail: validationError },
      { status: 400 }
    );
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
    const cas = await upsertCompositionPolicyOverridesWithCas(sb, surface, rows, {
      userId,
      nickname: userId.slice(0, 8),
    }, expectedRevision);

    if (!cas.ok) {
      if (cas.error === "stale_revision") {
        const stale = cas as Extract<CompositionPolicyCasResult, { ok: false; error: "stale_revision" }>;
        return NextResponse.json(
          {
            ok: false,
            error: "stale_revision",
            currentRevision: stale.currentRevision,
            expectedRevision: stale.expectedRevision,
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ ok: false, error: cas.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      surface,
      saved: rows.length,
      revision: cas.revision,
      engineStatus: "live",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "save_failed";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[admin stores-composition-policy PUT]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
