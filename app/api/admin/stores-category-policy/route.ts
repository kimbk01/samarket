import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { listBrowsePrimaryIndustries, listBrowseSubIndustries } from "@/lib/stores/browse-taxonomy-seed-queries";
import {
  getBrowseScopePolicyRevision,
  listBrowseScopePolicyRows,
  mapBrowseScopeDbRow,
  saveBrowseScopePolicyWithCas,
  type BrowseScopePolicyWriteInput,
} from "@/lib/stores/product/stores-browse-scope-policy-db";
import {
  buildBrowsePrimaryScopeKey,
  buildBrowseSubScopeKey,
  resolveBrowseScopePolicy,
} from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRevision(raw: unknown): number | "invalid" {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return "invalid";
  return n;
}

function parseScopeRows(raw: unknown): BrowseScopePolicyWriteInput[] | "invalid" {
  if (!Array.isArray(raw)) return "invalid";
  const out: BrowseScopePolicyWriteInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return "invalid";
    const o = item as Record<string, unknown>;
    out.push({
      scopeKey: String(o.scopeKey ?? ""),
      primarySlug: String(o.primarySlug ?? ""),
      subSlug: o.subSlug != null && String(o.subSlug).trim() ? String(o.subSlug) : null,
      enabled: Boolean(o.enabled),
      displayTitleKo: o.displayTitleKo != null ? String(o.displayTitleKo) : null,
      displayTitleEn: o.displayTitleEn != null ? String(o.displayTitleEn) : null,
      adEnabled: (o.adEnabled as BrowseScopePolicyWriteInput["adEnabled"]) ?? "inherit",
      couponEnabled: (o.couponEnabled as BrowseScopePolicyWriteInput["couponEnabled"]) ?? "inherit",
      maxInsertion: o.maxInsertion === null || o.maxInsertion === "" ? null : Number(o.maxInsertion),
      intervalEveryN:
        o.intervalEveryN === null || o.intervalEveryN === "" ? null : Number(o.intervalEveryN),
      presentationMode:
        (o.presentationMode as BrowseScopePolicyWriteInput["presentationMode"]) ?? "inherit",
      scheduleStart: o.scheduleStart === null ? null : o.scheduleStart != null ? String(o.scheduleStart) : null,
      scheduleEnd: o.scheduleEnd === null ? null : o.scheduleEnd != null ? String(o.scheduleEnd) : null,
      productConfig:
        o.productConfig && typeof o.productConfig === "object"
          ? (o.productConfig as Record<string, unknown>)
          : {},
    });
  }
  return out;
}

export async function GET(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const primarySlug = req.nextUrl.searchParams.get("primary")?.trim().toLowerCase() ?? null;
  const subSlug = req.nextUrl.searchParams.get("sub")?.trim().toLowerCase() ?? null;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  try {
    const [dbRows, revision] = await Promise.all([
      listBrowseScopePolicyRows(sb),
      getBrowseScopePolicyRevision(sb),
    ]);
    const mapped = dbRows.map(mapBrowseScopeDbRow);
    const byScope = new Map(mapped.map((r) => [r.scopeKey, r]));

    const primaries = listBrowsePrimaryIndustries().map((p) => {
      const scopeKey = buildBrowsePrimaryScopeKey(p.slug);
      const row = byScope.get(scopeKey) ?? null;
      const resolved = resolveBrowseScopePolicy({
        primarySlug: p.slug,
        subSlug: null,
        primaryRow: row,
        subRow: null,
      });
      return {
        primarySlug: p.slug,
        nameKo: p.nameKo,
        nameEn: p.nameEn,
        scopeKey,
        row,
        resolved,
      };
    });

    let secondary: Array<{
      subSlug: string;
      nameKo: string;
      nameEn: string;
      scopeKey: string;
      row: ReturnType<typeof mapBrowseScopeDbRow> | null;
      resolved: ReturnType<typeof resolveBrowseScopePolicy>;
    }> = [];

    if (primarySlug) {
      secondary = listBrowseSubIndustries(primarySlug).map((s) => {
        const pRow = byScope.get(buildBrowsePrimaryScopeKey(primarySlug)) ?? null;
        const scopeKey = buildBrowseSubScopeKey(primarySlug, s.slug);
        const sRow = byScope.get(scopeKey) ?? null;
        return {
          subSlug: s.slug,
          nameKo: s.nameKo,
          nameEn: s.nameEn ?? s.slug,
          scopeKey,
          row: sRow,
          resolved: resolveBrowseScopePolicy({
            primarySlug,
            subSlug: s.slug,
            primaryRow: pRow,
            subRow: sRow,
          }),
        };
      });
    }

    const focused =
      primarySlug && subSlug
        ? resolveBrowseScopePolicy({
            primarySlug,
            subSlug,
            primaryRow: byScope.get(buildBrowsePrimaryScopeKey(primarySlug)) ?? null,
            subRow: byScope.get(buildBrowseSubScopeKey(primarySlug, subSlug)) ?? null,
          })
        : primarySlug
          ? resolveBrowseScopePolicy({
              primarySlug,
              subSlug: null,
              primaryRow: byScope.get(buildBrowsePrimaryScopeKey(primarySlug)) ?? null,
              subRow: null,
            })
          : null;

    return NextResponse.json({
      ok: true,
      revision,
      primaries,
      secondary,
      focused,
      primarySlug,
      subSlug,
      rankingEditable: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "load_failed";
    console.error("[admin stores-category-policy GET]", e);
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

  const rows = parseScopeRows(body.rows);
  if (rows === "invalid") {
    return NextResponse.json({ ok: false, error: "invalid_rows" }, { status: 400 });
  }

  const expectedRevision = parseRevision(body.expectedRevision);
  if (expectedRevision === "invalid") {
    return NextResponse.json({ ok: false, error: "invalid_expected_revision" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  try {
    const result = await saveBrowseScopePolicyWithCas(sb, rows, userId, expectedRevision);
    if (!result.ok) {
      if (result.error === "stale_revision") {
        return NextResponse.json(
          { ok: false, error: "stale_revision", currentRevision: result.currentRevision },
          { status: 409 }
        );
      }
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, revision: result.revision, saved: rows.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "save_failed";
    console.error("[admin stores-category-policy PUT]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
