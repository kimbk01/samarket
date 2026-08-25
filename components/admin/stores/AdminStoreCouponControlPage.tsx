"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  ADMIN_COUPON_CONTROL_CAMPAIGN_PARAM,
  ADMIN_COUPON_CONTROL_ROLES,
  ADMIN_COUPON_CONTROL_VIEW_PARAM,
  collectAdminCouponRecentActivity,
  parseAdminCouponControlCampaignId,
  parseAdminCouponControlRole,
  summarizeAdminCouponDashboardKpi,
  type AdminCouponControlRole,
} from "@/lib/stores/admin-coupon-control-shell";
import { AdminStoreCouponControlList } from "@/components/admin/stores/AdminStoreCouponControlList";
import { AdminStoreCouponControlDetail } from "@/components/admin/stores/AdminStoreCouponControlDetail";
import { AdminStoreCouponAdminCreatePanel } from "@/components/admin/stores/AdminStoreCouponAdminCreatePanel";
import type { CouponControlCampaignView } from "@/lib/stores/admin-coupon-control-realized";
import {
  adminCouponAuditActionMessageKey,
  formatAdminCouponDay,
  humanAdminStoreName,
  looksLikeRawOperatorToken,
} from "@/lib/stores/admin-coupon-control-view";

const ROLE_LABEL: Record<
  AdminCouponControlRole,
  | "store_coupon_admin_role_dashboard"
  | "store_coupon_admin_role_list"
  | "store_coupon_admin_role_detail"
  | "store_coupon_admin_role_create"
> = {
  dashboard: "store_coupon_admin_role_dashboard",
  list: "store_coupon_admin_role_list",
  detail: "store_coupon_admin_role_detail",
  create: "store_coupon_admin_role_create",
};

export function AdminStoreCouponControlPage() {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const role = parseAdminCouponControlRole(sp.get(ADMIN_COUPON_CONTROL_VIEW_PARAM));
  const campaignId = parseAdminCouponControlCampaignId(sp.get(ADMIN_COUPON_CONTROL_CAMPAIGN_PARAM));
  const [campaigns, setCampaigns] = useState<CouponControlCampaignView[]>([]);
  const [storeOptions, setStoreOptions] = useState<{ id: string; name: string }[]>([]);
  const [actError, setActError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/store-coupons", { credentials: "include", cache: "no-store" });
    const json = (await res.json()) as { ok?: boolean; campaigns?: CouponControlCampaignView[] };
    setCampaigns(json.ok ? json.campaigns ?? [] : []);
    try {
      const storesRes = await fetch("/api/admin/stores?status=approved", { credentials: "include", cache: "no-store" });
      const storesJson = (await storesRes.json()) as {
        ok?: boolean;
        stores?: { id?: string; store_name?: string; slug?: string }[];
      };
      if (storesJson.ok) {
        const seen = new Set<string>();
        const out: { id: string; name: string }[] = [];
        for (const s of storesJson.stores ?? []) {
          const id = String(s.id ?? "").trim();
          if (!id || seen.has(id)) continue;
          const name = humanAdminStoreName(s.store_name) ?? humanAdminStoreName(s.slug);
          if (!name) continue;
          seen.add(id);
          out.push({ id, name });
        }
        setStoreOptions(out);
      }
    } catch {
      /* keep campaign list */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const goRole = (next: AdminCouponControlRole) => {
    const params = new URLSearchParams(sp.toString());
    if (next === "dashboard") params.delete(ADMIN_COUPON_CONTROL_VIEW_PARAM);
    else params.set(ADMIN_COUPON_CONTROL_VIEW_PARAM, next);
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  };

  const goDetail = (id: string) => {
    const params = new URLSearchParams(sp.toString());
    params.set(ADMIN_COUPON_CONTROL_VIEW_PARAM, "detail");
    params.set(ADMIN_COUPON_CONTROL_CAMPAIGN_PARAM, id);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const selected = useMemo(
    () => campaigns.find((c) => c.id === campaignId) ?? null,
    [campaigns, campaignId]
  );

  const act = async (id: string, action: string, revokeReason?: string) => {
    setActError(null);
    const body: Record<string, unknown> = { id, action };
    if (action === "revoke") {
      const reason = (revokeReason ?? "").trim();
      if (reason.length < 2) {
        setActError(t("store_coupon_admin_revoke_fail"));
        return;
      }
      body.reason = reason;
    }
    const res = await fetch("/api/admin/store-coupons", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      setActError(
        json.error === "revoke_reason_required"
          ? t("store_coupon_admin_revoke_fail")
          : safeT("store_coupon_admin_act_fail", {
              fallbackKo: "처리할 수 없습니다.",
              fallbackEn: "Could not complete that action.",
            })
      );
      return;
    }
    await load();
  };

  const kpi = useMemo(() => summarizeAdminCouponDashboardKpi(campaigns), [campaigns]);
  const recent = useMemo(() => collectAdminCouponRecentActivity(campaigns), [campaigns]);

  return (
    <AdminDeliveryCmsChrome>
      <div className="flex min-w-0 flex-col gap-4" data-admin-coupon-shell="1" data-admin-coupon-role={role}>
        <AdminPageHeader titleKey="store_coupon_admin_control_title" descriptionKey="store_coupon_admin_control_desc" />
        <nav
          className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4"
          data-admin-coupon-role-nav="1"
          aria-label={t("store_coupon_admin_control_title")}
        >
          {ADMIN_COUPON_CONTROL_ROLES.map((id) => {
            const selected = role === id;
            return (
              <button
                key={id}
                type="button"
                data-admin-coupon-role-tab={id}
                aria-current={selected ? "page" : undefined}
                className={`flex min-h-[48px] min-w-0 items-center justify-center rounded-ui-rect px-3 text-sm font-medium ${
                  selected ? "bg-signature text-white" : "border border-sam-border bg-sam-surface text-sam-fg"
                }`}
                onClick={() => goRole(id)}
              >
                {t(ROLE_LABEL[id])}
              </button>
            );
          })}
        </nav>

        {role === "dashboard" ? (
          <div className="flex min-w-0 flex-col gap-3" data-admin-coupon-pane="dashboard">
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ["store_coupon_admin_kpi_total", kpi.total],
                  ["store_coupon_admin_kpi_active", kpi.active],
                  ["store_coupon_admin_kpi_waiting", kpi.waiting],
                  ["store_coupon_admin_kpi_ended", kpi.ended],
                ] as const
              ).map(([key, value]) => (
                <div key={key} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                  <p className="text-sm text-sam-muted">{t(key)}</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-sam-fg">{value}</p>
                </div>
              ))}
            </div>
            <AdminCard titleKey="store_coupon_admin_recent">
              {recent.length === 0 ? (
                <p className="text-sm text-sam-muted">{t("store_coupon_admin_recent_empty")}</p>
              ) : (
                <ul className="space-y-2">
                  {recent.map((row, i) => {
                    const actor =
                      humanAdminStoreName(row.actor_label) ??
                      safeT("store_coupon_admin_actor_fallback", {
                        fallbackKo: "운영",
                        fallbackEn: "Ops",
                      });
                    const title = row.title.trim();
                    const titleOk = title && !looksLikeRawOperatorToken(title);
                    return (
                      <li key={`${row.created_at}-${i}`} className="min-w-0 break-words text-sm text-sam-fg">
                        {formatAdminCouponDay(row.created_at)}
                        {" · "}
                        {actor}
                        {" · "}
                        {t(adminCouponAuditActionMessageKey(row.action))}
                        {titleOk ? ` · ${title}` : ""}
                      </li>
                    );
                  })}
                </ul>
              )}
            </AdminCard>
          </div>
        ) : null}

        {role === "list" ? (
          <AdminStoreCouponControlList campaigns={campaigns} onOpenDetail={goDetail} />
        ) : null}

        {role === "detail" ? (
          <AdminStoreCouponControlDetail campaign={selected} onAct={act} actError={actError} />
        ) : null}

        {role === "create" ? (
          <AdminStoreCouponAdminCreatePanel
            stores={storeOptions}
            onCreated={() => {
              void load();
              goRole("list");
            }}
          />
        ) : null}
      </div>
    </AdminDeliveryCmsChrome>
  );
}
