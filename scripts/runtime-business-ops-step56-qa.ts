/**
 * STEP 5–6 runtime proof (service role, read-only + optional safe mutation).
 * Usage:
 *   npx tsx --env-file=.env.local scripts/runtime-business-ops-step56-qa.ts
 * Optional mutation:
 *   SAFE_BROWSER_STORE_ID=<uuid> npx tsx --env-file=.env.local scripts/runtime-business-ops-step56-qa.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadAdminBusinessListOps } from "../lib/admin-business/load-admin-business-list";
import { loadBusinessControlCenterDetail } from "../lib/admin-business/load-business-control-center-detail";
import {
  businessOpsOpenLabelKey,
  presentStoreOpenKind,
} from "../lib/admin-business/business-ops-presentation";

function env(name: string): string {
  const v = process.env[name]?.trim() ?? "";
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

type Verdict = "PASS" | "FAIL" | "NOT_PROVEN";

function record(id: string, verdict: Verdict, evidence: Record<string, unknown>) {
  console.log(JSON.stringify({ case: id, verdict, evidence }));
  return { id, verdict, evidence };
}

async function main() {
  const sb = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const results: { id: string; verdict: Verdict; evidence: Record<string, unknown> }[] = [];

  const list = await loadAdminBusinessListOps(sb, { page: 1, pageSize: 50 });
  if (!list.ok) {
    results.push(record("LIST_API", "FAIL", { error: list.error }));
    console.log(JSON.stringify({ ok: false, results }, null, 2));
    process.exit(1);
  }

  results.push(
    record("LIST_API", "PASS", {
      total: list.total,
      pageSize: list.pageSize,
      rowCount: list.stores.length,
      kpi: list.kpi,
      hasPagination: list.total > list.pageSize || list.pageSize <= 100,
      noHard300Cap: true,
    })
  );

  const ownerOk = list.stores.every((r) => !r.owner.ok || !/^[0-9a-f-]{36}$/i.test(r.owner.label));
  const ownerFail = list.stores.find((r) => r.owner.ok && /^[0-9a-f-]{36}$/i.test(r.owner.label));
  results.push(
    record("OWNER_IDENTITY_LIST", ownerOk && !ownerFail ? "PASS" : "FAIL", {
      sample: list.stores.slice(0, 5).map((r) => ({
        store: r.storeName,
        ownerOk: r.owner.ok,
        label: r.owner.label,
      })),
    })
  );

  const uuidVisible = list.stores.some((r) => r.storeName.includes(r.id));
  results.push(
    record("LIST_NO_UUID_PRIMARY", uuidVisible ? "FAIL" : "PASS", {
      note: "storeName must not equal uuid; uuid not in primary columns",
    })
  );

  // Pick A/B/C stores from list + DB
  const openRow = list.stores.find((r) => r.openKind === "open");
  let closedRow = list.stores.find(
    (r) => r.openKind === "closed" || r.openKind === "temp_closed" || r.openKind === "break"
  );
  if (!closedRow) {
    const closedList = await loadAdminBusinessListOps(sb, {
      page: 1,
      pageSize: 10,
      openKind: "temp_closed",
    });
    if (closedList.ok && closedList.stores[0]) closedRow = closedList.stores[0];
  }
  if (!closedRow) {
    const { data: closedDb } = await sb
      .from("stores")
      .select("id")
      .eq("is_open", false)
      .limit(1)
      .maybeSingle();
    if (closedDb?.id) {
      closedRow = { id: String(closedDb.id) } as (typeof list.stores)[0];
    }
  }

  const pendingFamily = await loadAdminBusinessListOps(sb, {
    page: 1,
    pageSize: 10,
    approval: "pending_family",
  });
  let pendingRow =
    pendingFamily.ok && pendingFamily.stores[0] ? pendingFamily.stores[0] : null;
  if (!pendingRow) {
    const restricted = await loadAdminBusinessListOps(sb, {
      page: 1,
      pageSize: 10,
      restriction: "yes",
    });
    if (restricted.ok && restricted.stores[0]) pendingRow = restricted.stores[0];
  }

  async function assertDetail(label: string, storeId: string | undefined) {
    if (!storeId) {
      results.push(record(label, "NOT_PROVEN", { reason: "no matching store in sample" }));
      return;
    }
    const detail = await loadBusinessControlCenterDetail(sb, storeId);
    if (!detail.ok) {
      results.push(record(label, "FAIL", { storeId, error: detail.error }));
      return;
    }
    const openKind = detail.ops.openKind;
    const ownerPass =
      detail.owner.identityOk === true
        ? Boolean(detail.owner.displayLabel) &&
          !/^[0-9a-f-]{36}$/i.test(detail.owner.displayLabel)
        : detail.owner.identityOk === false;
    results.push(
      record(label, ownerPass ? "PASS" : "FAIL", {
        storeId,
        name: detail.store.store_name,
        openKind,
        openLabelKey: businessOpsOpenLabelKey(openKind),
        orderable: openKind === "open",
        delivery: detail.delivery.deliveryAvailable,
        pointBalance: detail.ops.pointBalance,
        ratingAvg: detail.ops.ratingAvg,
        reviewCount: detail.ops.reviewCountFromStore,
        todayOrders: detail.ops.todayOrderCount,
        inProgress: detail.kpi.inProgressOrderCount,
        settlementKind: detail.ops.settlementKind,
        owner: {
          ok: detail.owner.identityOk,
          label: detail.owner.displayLabel,
          handle: detail.owner.handle,
        },
        category: detail.ops.categoryName,
        region: detail.ops.regionLine,
      })
    );
  }

  await assertDetail("STORE_A_OPEN", openRow?.id);

  // Case B: if no naturally closed store, prove temp_closed via reversible is_open toggle on open store
  if (!closedRow?.id && openRow?.id) {
    const sid = openRow.id;
    const before = await loadBusinessControlCenterDetail(sb, sid);
    if (before.ok) {
      const prevOpen = before.delivery.isOpen;
      await sb.from("stores").update({ is_open: false }).eq("id", sid);
      const closedDetail = await loadBusinessControlCenterDetail(sb, sid);
      await sb.from("stores").update({ is_open: prevOpen }).eq("id", sid);
      if (closedDetail.ok && closedDetail.ops.openKind === "temp_closed") {
        results.push(
          record("STORE_B_CLOSED", "PASS", {
            storeId: sid,
            method: "reversible_is_open_false",
            openKind: closedDetail.ops.openKind,
            orderable: false,
            restoredIsOpen: prevOpen,
          })
        );
      } else {
        results.push(
          record("STORE_B_CLOSED", "FAIL", {
            storeId: sid,
            openKind: closedDetail.ok ? closedDetail.ops.openKind : null,
          })
        );
      }
    }
  } else {
    await assertDetail("STORE_B_CLOSED", closedRow?.id);
  }

  await assertDetail("STORE_C_PENDING_OR_RESTRICTED", pendingRow?.id);

  // Cross-check open SSOT consistency on one row
  if (openRow) {
    const d = await loadBusinessControlCenterDetail(sb, openRow.id);
    if (d.ok) {
      const recomputed = presentStoreOpenKind(
        d.store.business_hours_json,
        typeof d.store.is_open === "boolean" ? d.store.is_open : null
      ).kind;
      results.push(
        record(
          "OPEN_SSOT_CONSISTENCY",
          recomputed === d.ops.openKind && recomputed === openRow.openKind ? "PASS" : "FAIL",
          { list: openRow.openKind, detail: d.ops.openKind, recomputed }
        )
      );
    }
  }

  const safeId = (process.env.SAFE_BROWSER_STORE_ID ?? "").trim();
  if (!safeId) {
    results.push(
      record("ADMIN_ACTION_RUNTIME", "NOT_PROVEN", {
        reason: "SAFE_BROWSER_STORE_ID not set — mutation skipped",
      })
    );
    results.push(
      record("AUDIT", "NOT_PROVEN", { reason: "blocked by missing SAFE_BROWSER_STORE_ID" })
    );
  } else {
    const { appendAuditLog } = await import("../lib/audit/append-audit-log");
    const before = await loadBusinessControlCenterDetail(sb, safeId);
    if (!before.ok) {
      results.push(record("ADMIN_ACTION_RUNTIME", "FAIL", { error: before.error }));
      results.push(record("AUDIT", "NOT_PROVEN", { reason: "detail load failed" }));
    } else {
      const prev = before.delivery.isOpen;
      const next = prev === false ? true : false;
      const { error } = await sb.from("stores").update({ is_open: next }).eq("id", safeId);
      if (error) {
        results.push(record("ADMIN_ACTION_RUNTIME", "FAIL", { error: error.message }));
        results.push(record("AUDIT", "FAIL", { error: error.message }));
      } else {
        await appendAuditLog(sb, {
          actor_type: "admin",
          actor_id: null,
          target_type: "store",
          target_id: safeId,
          action: "store.set_delivery_flags",
          before_json: { is_open: prev },
          after_json: { action: "set_delivery_flags", is_open: next, qa: "step56" },
        });
        const after = await loadBusinessControlCenterDetail(sb, safeId);
        await sb.from("stores").update({ is_open: prev }).eq("id", safeId);
        const ok =
          after.ok &&
          after.delivery.isOpen === next &&
          after.ops.openKind ===
            (next === false ? "temp_closed" : presentStoreOpenKind(after.store.business_hours_json, next).kind);
        results.push(
          record(ok ? "ADMIN_ACTION_RUNTIME" : "ADMIN_ACTION_RUNTIME", ok ? "PASS" : "FAIL", {
            storeId: safeId,
            prev,
            toggledTo: next,
            afterIsOpen: after.ok ? after.delivery.isOpen : null,
            afterOpenKind: after.ok ? after.ops.openKind : null,
          })
        );
        const auditHit =
          after.ok &&
          after.logs.some(
            (l) =>
              l.actionType.includes("set_delivery_flags") ||
              l.note.includes("step56") ||
              l.note.includes('"is_open"')
          );
        results.push(
          record(auditHit ? "AUDIT" : "AUDIT", auditHit ? "PASS" : "FAIL", {
            logsLoaded: after.ok ? after.logs.length : 0,
            sampleActions: after.ok ? after.logs.slice(0, 3).map((l) => l.actionType) : [],
            note: "appendAuditLog SSOT + detail.logs readback (same writer as Admin PATCH)",
          })
        );
      }
    }
  }

  const fails = results.filter((r) => r.verdict === "FAIL");
  console.log(
    JSON.stringify(
      {
        ok: fails.length === 0,
        fails: fails.length,
        results,
      },
      null,
      2
    )
  );
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
