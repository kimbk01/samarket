import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import {
  getCompositionPolicySurfaceRevision,
  loadResolvedCompositionPolicy,
  upsertCompositionPolicyOverridesWithCas,
} from "@/lib/stores/composition/stores-composition-policy-db";
import { parseExpectedCompositionPolicyRevision } from "@/lib/stores/composition/stores-composition-policy-concurrency";
import { validateCompositionPolicyBatch } from "@/lib/stores/composition/stores-composition-policy-validation";
import {
  homeShelfDbRowsToOverrides,
  listHomeShelfProductDbRows,
  upsertHomeShelfProductFields,
} from "@/lib/stores/product/stores-home-shelf-product-db";
import {
  resolveHomeShelfProductCatalog,
  type StoresHomeShelfProductOverride,
} from "@/lib/stores/product/stores-home-shelf-product-resolve";
import { STORES_HOME_SHELF_PRODUCT_CATALOG } from "@/lib/stores/product/stores-home-shelf-product-catalog";
import { shelfIdToComposerSlot } from "@/lib/stores/product/stores-home-shelf-product-catalog";
import {
  parseHomeShelfProductConfig,
} from "@/lib/stores/product/stores-home-shelf-product-config";
import { STORES_HOME_COMPOSITION_DEFAULT_POLICY } from "@/lib/stores/composition/stores-home-composition-default-policy";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ShelfWritePayload = {
  shelfId: string;
  enabled: boolean;
  order: number;
  max: number | null;
  titleKo?: string;
  titleEn?: string;
  subtitleKo?: string;
  subtitleEn?: string;
  presentation?: string;
  couponIntegration?: string;
  adIntegration?: string;
  scheduleStart?: string | null;
  scheduleEnd?: string | null;
  productConfig?: Record<string, unknown>;
};

function parseShelves(raw: unknown): ShelfWritePayload[] | "invalid" {
  if (!Array.isArray(raw)) return "invalid";
  const out: ShelfWritePayload[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return "invalid";
    const o = item as Record<string, unknown>;
    out.push({
      shelfId: String(o.shelfId ?? ""),
      enabled: Boolean(o.enabled),
      order: Number(o.order),
      max: o.max === null || o.max === "" ? null : Number(o.max),
      titleKo: o.titleKo != null ? String(o.titleKo) : undefined,
      titleEn: o.titleEn != null ? String(o.titleEn) : undefined,
      subtitleKo: o.subtitleKo != null ? String(o.subtitleKo) : undefined,
      subtitleEn: o.subtitleEn != null ? String(o.subtitleEn) : undefined,
      presentation: o.presentation != null ? String(o.presentation) : undefined,
      couponIntegration: o.couponIntegration != null ? String(o.couponIntegration) : undefined,
      adIntegration: o.adIntegration != null ? String(o.adIntegration) : undefined,
      scheduleStart: o.scheduleStart === null ? null : o.scheduleStart != null ? String(o.scheduleStart) : undefined,
      scheduleEnd: o.scheduleEnd === null ? null : o.scheduleEnd != null ? String(o.scheduleEnd) : undefined,
      productConfig:
        o.productConfig && typeof o.productConfig === "object"
          ? (o.productConfig as Record<string, unknown>)
          : undefined,
    });
  }
  return out;
}

export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  try {
    const [dbRows, revision, resolvedPolicy] = await Promise.all([
      listHomeShelfProductDbRows(sb),
      getCompositionPolicySurfaceRevision(sb, "home"),
      loadResolvedCompositionPolicy(sb, "home"),
    ]);
    const overrides = homeShelfDbRowsToOverrides(dbRows);
    const shelves = resolveHomeShelfProductCatalog(overrides);
    return NextResponse.json({
      ok: true,
      shelves,
      revision,
      overrideCount: dbRows.length,
      rankingEditable: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "load_failed";
    console.error("[admin stores-home-shelves GET]", e);
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

  const shelves = parseShelves(body.shelves);
  if (shelves === "invalid") {
    return NextResponse.json({ ok: false, error: "invalid_shelves" }, { status: 400 });
  }

  const expectedRevision = parseExpectedCompositionPolicyRevision(body.expectedRevision);
  if (expectedRevision === "invalid") {
    return NextResponse.json({ ok: false, error: "invalid_expected_revision" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const validShelfIds = new Set(STORES_HOME_SHELF_PRODUCT_CATALOG.map((s) => s.shelfId));
  for (const shelf of shelves) {
    if (!validShelfIds.has(shelf.shelfId as (typeof STORES_HOME_SHELF_PRODUCT_CATALOG)[number]["shelfId"])) {
      return NextResponse.json({ ok: false, error: "invalid_shelf_id", shelfId: shelf.shelfId }, { status: 400 });
    }
    const def = STORES_HOME_SHELF_PRODUCT_CATALOG.find((s) => s.shelfId === shelf.shelfId);
    if (def?.availability === "unavailable") {
      return NextResponse.json({ ok: false, error: "unavailable_shelf_not_editable", shelfId: shelf.shelfId }, { status: 400 });
    }
  }

  const compositionRowsFromShelves = shelves
    .map((shelf) => {
      const slot = shelfIdToComposerSlot(shelf.shelfId);
      if (!slot) return null;
      const defaultRow = STORES_HOME_COMPOSITION_DEFAULT_POLICY.find((r) => r.slot === slot);
      return {
        surface: "home" as const,
        slot,
        contentType: defaultRow?.contentType ?? "food_product",
        enabled: shelf.enabled,
        order: shelf.order,
        max: shelf.max,
        interval: { consumed: false as const, reason: "NOT_CONSUMED" as const },
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  // Preserve non-shelf HOME slots (paid-ad / coupon insertion) so surface batch stays complete.
  const currentPolicy = await loadResolvedCompositionPolicy(sb, "home");
  const shelfSlots = new Set<string>(compositionRowsFromShelves.map((r) => r.slot));
  const preservedRows = currentPolicy.rows
    .filter((r) => !shelfSlots.has(r.slot))
    .map((r) => ({
      surface: "home" as const,
      slot: r.slot,
      contentType: r.contentType,
      enabled: r.enabled,
      order: r.order,
      max: r.max,
      interval: { consumed: false as const, reason: "NOT_CONSUMED" as const },
    }));
  const compositionRows = [...compositionRowsFromShelves, ...preservedRows];

  const validationError = validateCompositionPolicyBatch("home", compositionRows);
  if (validationError) {
    return NextResponse.json({ ok: false, error: validationError.code, detail: validationError }, { status: 400 });
  }

  try {
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
            expectedRevision,
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ ok: false, error: cas.error }, { status: 400 });
    }

    const productOverrides: StoresHomeShelfProductOverride[] = shelves.map((s) => ({
      shelfId: s.shelfId,
      enabled: s.enabled,
      order: s.order,
      max: s.max,
      titleKo: s.titleKo ?? null,
      titleEn: s.titleEn ?? null,
      subtitleKo: s.subtitleKo ?? null,
      subtitleEn: s.subtitleEn ?? null,
      presentation: s.presentation as StoresHomeShelfProductOverride["presentation"],
      couponIntegration: s.couponIntegration as StoresHomeShelfProductOverride["couponIntegration"],
      adIntegration: s.adIntegration as StoresHomeShelfProductOverride["adIntegration"],
      scheduleStart: s.scheduleStart,
      scheduleEnd: s.scheduleEnd,
      productConfig: s.productConfig ? parseHomeShelfProductConfig(s.productConfig) : undefined,
    }));

    await upsertHomeShelfProductFields(sb, productOverrides, userId);

    return NextResponse.json({ ok: true, revision: cas.revision, saved: shelves.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "save_failed";
    console.error("[admin stores-home-shelves PUT]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
