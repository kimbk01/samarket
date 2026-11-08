"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";
import { formatAdminShortId } from "@/components/admin/ui/AdminTechId";
import { useAdminWriteGuard } from "@/components/admin/access/use-admin-route-access";

/**
 * 어드민 › 상위노출 가격 (Owner 2026-11-03 「1번부터 시작」).
 * 가격·기간·사용 여부를 바꾸면 다음 신청부터 적용된다 — 이미 신청한 광고(주문 행 금액·기간)에는 적용되지 않는다.
 * 저장 = 사유 필수(L2) · 다른 관리자가 먼저 저장했으면 409 → 새 값으로 다시 그림(덮어쓰기 없음).
 */
type Product = {
  id: string;
  domain: "trade" | "community";
  durationDays: number;
  pointCost: number;
  isActive: boolean;
  revision: number;
  updatedAt: string | null;
  fallbackTitleKo: string;
  fallbackTitleEn: string;
};
type Change = {
  id: string;
  productId: string;
  changedAt: string;
  adminId: string | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason: string;
};
type Snapshot = {
  migrated: boolean;
  products: Product[];
  changes: Change[];
  activeCounts: Record<string, number>;
  adminNames: Record<string, string>;
};
type Draft = { pointCost: string; durationDays: string; isActive: boolean };

function draftOf(p: Product): Draft {
  return { pointCost: String(p.pointCost), durationDays: String(p.durationDays), isActive: p.isActive };
}

export function AdminMemberPromotionProductsPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<{ code: string; httpStatus: number } | null>(null);
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  /**
   * 광고 ② PB-54·AD-126 (2026-11-04): 저장 권한 — 서버와 같은 기준(거래 상품 = 거래 Admin, 커뮤니티 상품 = 거래 Admin + 커뮤니티 홍보).
   * 권한이 없으면 버튼을 끄고, 눌러도 사유 창을 열기 **전에** 막고 안내한다(AD-204 공통 규칙).
   */
  const tradeWrite = useAdminWriteGuard("/admin/trade-ad-policies");
  const communityWrite = useAdminWriteGuard("/admin/community/promotions");
  const writeStateOf = (domain: Product["domain"]) => {
    const allowed = tradeWrite.allowed && (domain !== "community" || communityWrite.allowed);
    const loading = tradeWrite.loading || (domain === "community" && communityWrite.loading);
    const reason = !tradeWrite.allowed ? tradeWrite.reason : domain === "community" && !communityWrite.allowed ? communityWrite.reason : null;
    return { allowed, loading, reason };
  };
  const guardWrite = (domain: Product["domain"]) =>
    tradeWrite.guard() && (domain !== "community" || communityWrite.guard());

  const apply = useCallback((s: Snapshot) => {
    setSnap(s);
    setDrafts(Object.fromEntries(s.products.map((p) => [p.id, draftOf(p)])));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await fetch("/api/admin/member-promotion-products", { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as Partial<Snapshot> & { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) setLoadErr({ code: j.error || `http_${res.status}`, httpStatus: res.status });
      else apply(j as Snapshot);
    } catch {
      setLoadErr({ code: "network_error", httpStatus: 0 });
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    void load();
  }, [load]);

  const titleOf = (p: Pick<Product, "fallbackTitleKo" | "fallbackTitleEn">) => (ko ? p.fallbackTitleKo : p.fallbackTitleEn);

  const save = async (p: Product) => {
    if (!guardWrite(p.domain)) return;
    const d = drafts[p.id];
    if (!d) return;
    const pointCost = Math.floor(Number(d.pointCost));
    const durationDays = Math.floor(Number(d.durationDays));
    if (!Number.isFinite(pointCost) || pointCost < 1 || !Number.isFinite(durationDays) || durationDays < 1 || durationDays > 90) {
      setMsg(t("admin_boost_prices_invalid"));
      return;
    }
    if (pointCost === p.pointCost && durationDays === p.durationDays && d.isActive === p.isActive) {
      setMsg(t("admin_boost_prices_no_change"));
      return;
    }
    const fmt = (c: number, days: number, on: boolean) =>
      `${formatAdminNumber(c)}P · ${days}${t("admin_d")}${on ? "" : ` · ${t("admin_boost_prices_off")}`}`;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("pointPolicySave"),
      ko,
      title: t("admin_boost_prices_confirm_title", {
        product: titleOf(p),
        before: fmt(p.pointCost, p.durationDays, p.isActive),
        after: fmt(pointCost, durationDays, d.isActive),
      }),
      description: t("admin_boost_prices_confirm_desc"),
      confirmLabel: t("admin_boost_prices_save"),
    });
    if (!confirmed.ok) return;
    setBusyId(p.id);
    setMsg("");
    try {
      const res = await fetch("/api/admin/member-promotion-products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: p.id,
          expectedRevision: p.revision,
          pointCost,
          durationDays,
          isActive: d.isActive,
          reason: confirmed.reason ?? "",
        }),
      });
      const j = (await res.json().catch(() => ({}))) as Partial<Snapshot> & { ok?: boolean; error?: string };
      if (res.status === 409 && j.error === "revision_conflict") {
        if (j.products) apply(j as Snapshot);
        setMsg(t("admin_boost_prices_conflict"));
        return;
      }
      if (!res.ok || !j.ok) {
        setMsg(j.error === "no_change" ? t("admin_boost_prices_no_change") : adminOperatorErrorMessage(j.error ?? "update_failed", ko));
        return;
      }
      if (j.products) apply(j as Snapshot);
      else await load();
    } catch {
      setMsg(adminOperatorErrorMessage("network_error", ko));
    } finally {
      setBusyId(null);
    }
  };

  const productById = new Map((snap?.products ?? []).map((p) => [p.id, p]));
  const changeText = (v: Record<string, unknown>) =>
    `${formatAdminNumber(v.point_cost as number)}P · ${String(v.duration_days ?? "—")}${t("admin_d")} · ${
      v.is_active === false ? t("admin_boost_prices_off") : t("admin_boost_prices_on")
    }`;

  return (
    <div className="space-y-6">
      <AdminPageHeader titleKey="admin_boost_prices_title" descriptionKey="admin_boost_prices_desc" />

      {snap && !snap.migrated ? (
        <div role="status" className="rounded-ui-rect border border-sam-border bg-sam-surface-muted px-4 py-3 sam-text-body-secondary text-sam-fg">
          {t("admin_boost_prices_migration_pending")}
        </div>
      ) : null}
      {msg ? (
        <div role="alert" className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-4 py-3 sam-text-body-secondary text-sam-fg">
          {msg}
        </div>
      ) : null}
      {loadErr ? <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.httpStatus} onRetry={() => void load()} /> : null}

      {!snap ? (
        loading ? <AdminLoadingState ko={ko} label={t("common_loading")} /> : null
      ) : (
        <>
          <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
            <table className="min-w-full text-left sam-text-body-secondary">
              <thead className="bg-sam-surface-muted text-sam-muted">
                <tr>
                  <th className="px-3 py-2">{t("admin_boost_prices_th_product")}</th>
                  <th className="px-3 py-2">{t("admin_boost_prices_th_points")}</th>
                  <th className="px-3 py-2">{t("admin_boost_prices_th_days")}</th>
                  <th className="px-3 py-2">{t("admin_boost_prices_th_active")}</th>
                  <th className="px-3 py-2">{t("admin_boost_prices_th_running")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {snap.products.map((p) => {
                  const d = drafts[p.id] ?? draftOf(p);
                  const write = writeStateOf(p.domain);
                  const locked = !snap.migrated || busyId === p.id || !write.allowed;
                  return (
                    <tr key={p.id} className="border-t border-sam-border-soft">
                      <td className="px-3 py-2 font-medium text-sam-fg">{titleOf(p)}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          disabled={locked}
                          value={d.pointCost}
                          onChange={(e) => setDrafts((m) => ({ ...m, [p.id]: { ...d, pointCost: e.target.value } }))}
                          className="w-28 rounded-ui-rect border border-sam-border px-2 py-1 text-right tabular-nums"
                          aria-label={`${titleOf(p)} ${t("admin_boost_prices_th_points")}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          max={90}
                          inputMode="numeric"
                          disabled={locked}
                          value={d.durationDays}
                          onChange={(e) => setDrafts((m) => ({ ...m, [p.id]: { ...d, durationDays: e.target.value } }))}
                          className="w-20 rounded-ui-rect border border-sam-border px-2 py-1 text-right tabular-nums"
                          aria-label={`${titleOf(p)} ${t("admin_boost_prices_th_days")}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            disabled={locked}
                            checked={d.isActive}
                            onChange={(e) => setDrafts((m) => ({ ...m, [p.id]: { ...d, isActive: e.target.checked } }))}
                          />
                          {d.isActive ? t("admin_boost_prices_on") : t("admin_boost_prices_off")}
                        </label>
                      </td>
                      <td className="px-3 py-2 text-sam-muted">
                        {t("admin_boost_prices_running_count", { count: String(snap.activeCounts[p.id] ?? 0) })}
                      </td>
                      <td className="px-3 py-2">
                        <AdminActionButton variant="primary" size="sm" disabled={locked} onClick={() => void save(p)}>
                          {t("admin_boost_prices_save")}
                        </AdminActionButton>
                        {!write.allowed && !write.loading ? (
                          <p className="mt-1 sam-text-helper text-sam-muted" data-admin-write-denied="">
                            {t("ads1104p_admin_boost_prices_write_denied", {
                              reason: write.reason ?? t("ads1104p_admin_write_denied_default"),
                            })}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <section className="space-y-2">
            <h2 className="sam-text-body font-semibold text-sam-fg">{t("admin_boost_prices_history")}</h2>
            {snap.changes.length === 0 ? (
              <p className="sam-text-body-secondary text-sam-muted">{t("admin_boost_prices_history_empty")}</p>
            ) : (
              <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
                <table className="min-w-full text-left sam-text-body-secondary">
                  <thead className="bg-sam-surface-muted text-sam-muted">
                    <tr>
                      <th className="px-3 py-2">{t("admin_boost_prices_th_when")}</th>
                      <th className="px-3 py-2">{t("admin_boost_prices_th_admin")}</th>
                      <th className="px-3 py-2">{t("admin_boost_prices_th_product")}</th>
                      <th className="px-3 py-2">{t("admin_boost_prices_th_change")}</th>
                      <th className="px-3 py-2">{t("admin_boost_prices_th_reason")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.changes.map((c) => {
                      const p = productById.get(c.productId);
                      return (
                        <tr key={c.id} className="border-t border-sam-border-soft">
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums">{c.changedAt ? formatAdminDateTime(c.changedAt, language) : "—"}</td>
                          <td className="px-3 py-2">{c.adminId ? snap.adminNames[c.adminId] ?? formatAdminShortId(c.adminId) : "—"}</td>
                          <td className="px-3 py-2">{p ? titleOf(p) : c.productId}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {changeText(c.before)} → <b>{changeText(c.after)}</b>
                          </td>
                          <td className="px-3 py-2">{c.reason}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
