"use client";

import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminErrorState, AdminLoadingState, AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import {
  ADMIN_COUPON_CONTROL_CAMPAIGN_PARAM,
  ADMIN_COUPON_CONTROL_ROLES,
  ADMIN_COUPON_CONTROL_VIEW_PARAM,
  parseAdminCouponControlCampaignId,
  parseAdminCouponControlRole,
  type AdminCouponControlRole,
  type AdminCouponDashboardKpi,
  type AdminCouponRecentActivity,
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

/**
 * 「쿠폰 목록」 조건 = 주소 (R7) — 쿠폰번호 `q`(서버 조회) · 상태 `status` · 매장 `store_id` · 재원 `funding`.
 * 화면 전환 키 `view`·`campaign` 은 그대로 둔다.
 */
const COUPON_LIST_CONFIG = {
  statuses: ["active", "waiting", "ended"],
  extras: ["store_id", "funding"] as const,
};

export function AdminStoreCouponControlPage() {
  return (
    <Suspense fallback={null}>
      <AdminStoreCouponControlPageInner />
    </Suspense>
  );
}

function AdminStoreCouponControlPageInner() {
  const { t, safeT, language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const role = parseAdminCouponControlRole(sp.get(ADMIN_COUPON_CONTROL_VIEW_PARAM));
  const campaignId = parseAdminCouponControlCampaignId(sp.get(ADMIN_COUPON_CONTROL_CAMPAIGN_PARAM));
  const [campaigns, setCampaigns] = useState<CouponControlCampaignView[]>([]);
  /** 서버 페이지 결과 (R7) — 전체 건수·현황 KPI·최근 처리·매장 필터 옵션은 DB 가 전체 기준으로 계산한다. */
  const [total, setTotal] = useState(0);
  const [kpi, setKpi] = useState<AdminCouponDashboardKpi>({ total: 0, active: 0, waiting: 0, ended: 0 });
  const [recent, setRecent] = useState<AdminCouponRecentActivity[]>([]);
  const [listStoreOptions, setListStoreOptions] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<CouponControlCampaignView | null>(null);
  const [storeOptions, setStoreOptions] = useState<{ id: string; name: string }[]>([]);
  const [actError, setActError] = useState<string | null>(null);
  /** 처리 성공 결과 배너 (DEF-47) — 실패는 detail 의 actError(오류 코드 맵) 로 표시. */
  const [actDone, setActDone] = useState<{ ok: true; message: string } | null>(null);
  /** List load failure — shown as AdminErrorState, never as an empty list (DEF-44). */
  const [loadError, setLoadError] = useState<{ code: string; status?: number } | null>(null);
  const lq = useAdminListQuery(COUPON_LIST_CONFIG);
  /** 쿠폰번호 검색은 「쿠폰 목록」 화면에서만 서버 조회 조건 — 현황(dashboard) 집계는 항상 전체. */
  const couponNumberQuery = role === "list" ? lq.query.q : "";
  /** 목록 서버 조회 조건 (limit/offset/status/store_id/funding) — 쿠폰번호 검색 중이면 쓰지 않는다. */
  const listApiQuery = useMemo(() => {
    const params = new URLSearchParams(lq.apiQueryString);
    params.delete("q");
    return params.toString();
  }, [lq.apiQueryString]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const q = couponNumberQuery.trim();
    setLoading(true);
    let url: string;
    if (role === "detail") {
      if (!campaignId) {
        setSelected(null);
        setLoadError(null);
        setLoading(false);
        return;
      }
      url = `/api/admin/store-coupons?campaignId=${encodeURIComponent(campaignId)}`;
    } else if (role === "list" && q) {
      url = `/api/admin/store-coupons?couponNumber=${encodeURIComponent(q)}`;
    } else if (role === "list") {
      url = `/api/admin/store-coupons?${listApiQuery}`;
    } else {
      // 현황·발급: KPI·최근 처리만 필요 — 1행 페이지로 전체 기준 집계를 받는다.
      url = "/api/admin/store-coupons?limit=1&offset=0";
    }
    let next: CouponControlCampaignView[] = [];
    try {
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        campaigns?: CouponControlCampaignView[];
        total?: number;
        kpi?: AdminCouponDashboardKpi;
        recent?: AdminCouponRecentActivity[];
        stores?: { id?: string; name?: string }[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setLoadError({ code: json.error ?? "load_failed", status: res.status });
      } else {
        setLoadError(null);
        next = json.campaigns ?? [];
        if (role === "detail") {
          setSelected(next.find((c) => c.id === campaignId) ?? null);
        } else {
          setCampaigns(next);
          setTotal(typeof json.total === "number" ? json.total : next.length);
        }
        if (json.kpi) setKpi(json.kpi);
        if (json.recent) setRecent(json.recent);
        if (json.stores) {
          const seen = new Set<string>();
          const out: { id: string; name: string }[] = [];
          for (const s of json.stores) {
            const id = String(s.id ?? "").trim();
            if (!id || seen.has(id)) continue;
            const name = humanAdminStoreName(s.name);
            if (!name) continue;
            seen.add(id);
            out.push({ id, name });
          }
          setListStoreOptions(out);
        }
      }
    } catch {
      setLoadError({ code: "network_error" });
    }
    setLoading(false);
    // coupon_number search → open matching campaign detail (master trace entry)
    if (role === "list" && q && next.length === 1 && next[0]?.id) {
      const params = new URLSearchParams(sp.toString());
      params.set(ADMIN_COUPON_CONTROL_VIEW_PARAM, "detail");
      params.set(ADMIN_COUPON_CONTROL_CAMPAIGN_PARAM, String(next[0].id));
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [campaignId, couponNumberQuery, listApiQuery, pathname, role, router, sp]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 화면·조건(주소)·「새로고침」 때만 다시 불러온다
  }, [role, campaignId, couponNumberQuery, listApiQuery, lq.refreshKey]);

  useEffect(() => {
    // 발급 화면 매장 선택지 (승인 매장) — 화면 진입 시 1회
    let cancelled = false;
    void (async () => {
      try {
        const storesRes = await fetch("/api/admin/stores?status=approved", { credentials: "include", cache: "no-store" });
        const storesJson = (await storesRes.json()) as {
          ok?: boolean;
          stores?: { id?: string; store_name?: string; slug?: string }[];
        };
        if (cancelled || !storesJson.ok) return;
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
      } catch {
        /* keep campaign list */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  /** Confirmation (L1/L2/L3) is collected by the detail pane; this only sends + maps errors. */
  const act = async (id: string, action: string, reason?: string | null) => {
    setActError(null);
    setActDone(null);
    const body: Record<string, unknown> = { id, action };
    const trimmed = (reason ?? "").trim();
    if (action === "revoke" || action === "reject") {
      if (trimmed.length < 2) {
        setActError(adminOperatorErrorMessage(action === "revoke" ? "revoke_reason_required" : "reject_reason_required", ko));
        return;
      }
    }
    if (trimmed) body.reason = trimmed;
    try {
      const res = await fetch("/api/admin/store-coupons", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        const code = res.status === 403 ? "forbidden" : json.error;
        setActError(
          code
            ? adminOperatorErrorMessage(code, ko)
            : safeT("store_coupon_admin_act_fail", {
                fallbackKo: "처리할 수 없습니다.",
                fallbackEn: "Could not complete that action.",
              })
        );
        if (json.error === "invalid_coupon_transition") await load();
        return;
      }
    } catch {
      setActError(adminOperatorErrorMessage("network_error", ko));
      return;
    }
    setActDone({ ok: true, message: t("admin_r4c_coupon_act_done") });
    await load();
  };

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
              <AdminChipButton selected={selected} key={id} className="justify-center" data-admin-coupon-role-tab={id} aria-current={selected ? "page" : undefined} onClick={() => goRole(id)}>
                {t(ROLE_LABEL[id])}
              </AdminChipButton>
            );
          })}
        </nav>

        {loadError && role !== "list" ? (
          <AdminErrorState ko={ko} code={loadError.code} httpStatus={loadError.status} onRetry={() => void load()} />
        ) : null}

        {loading && campaigns.length === 0 && !loadError && (role === "dashboard" || role === "list") ? (
          <AdminLoadingState ko={ko} />
        ) : null}

        {role === "dashboard" && !loadError && !(loading && campaigns.length === 0) ? (
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
                  <p className="mt-1 text-[16px] font-bold tabular-nums text-sam-fg">{value}</p>
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
          <div className="flex min-w-0 flex-col gap-3">
            <div data-admin-coupon-number-search="1">
              <AdminFilterBar
                ko={ko}
                draft={lq.draft}
                onDraftChange={lq.setDraft}
                onSubmit={lq.submit}
                onReset={lq.reset}
                pending={loading}
                showPeriod={false}
                searchPlaceholder={t("store_coupon_admin_search_coupon_number")}
                status={{
                  label: t("store_coupon_admin_filter_status"),
                  value: lq.query.status,
                  onChange: lq.setStatus,
                  options: [
                    { value: "active", label: t("store_coupon_admin_kpi_active") },
                    { value: "waiting", label: t("store_coupon_admin_kpi_waiting") },
                    { value: "ended", label: t("store_coupon_admin_kpi_ended") },
                  ],
                }}
              >
                <label className="flex flex-col gap-1 text-[12px] font-medium text-sam-muted">
                  {t("store_coupon_admin_pick_store")}
                  <select
                    className="h-10 min-w-0 rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-sm text-sam-fg"
                    value={lq.query.extras.store_id}
                    onChange={(e) => lq.setExtra("store_id", e.target.value)}
                  >
                    <option value="">{t("store_coupon_admin_filter_all")}</option>
                    {listStoreOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[12px] font-medium text-sam-muted">
                  {t("store_coupon_funding")}
                  <select
                    className="h-10 min-w-0 rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-sm text-sam-fg"
                    value={lq.query.extras.funding}
                    onChange={(e) => lq.setExtra("funding", e.target.value)}
                  >
                    <option value="">{t("store_coupon_admin_filter_all")}</option>
                    <option value="STORE_FUNDED">{t("store_coupon_funding_store")}</option>
                    <option value="PLATFORM_FUNDED">{t("store_coupon_funding_platform")}</option>
                    <option value="SHARED_FUNDED">{t("store_coupon_funding_shared")}</option>
                  </select>
                </label>
              </AdminFilterBar>
            </div>
            {loadError ? (
              <AdminErrorState ko={ko} code={loadError.code} httpStatus={loadError.status} onRetry={lq.refresh} />
            ) : null}
            {loading && campaigns.length === 0 ? null : (
              <AdminStoreCouponControlList
                campaigns={campaigns}
                onOpenDetail={goDetail}
                total={total}
                page={couponNumberQuery ? 1 : lq.query.page}
                size={lq.query.size}
                onPageChange={lq.setPage}
                onSizeChange={lq.setSize}
                pending={loading}
                onReset={lq.isFiltered ? lq.reset : undefined}
              />
            )}
          </div>
        ) : null}

        {role === "detail" ? <AdminResultBanner ko={ko} result={actDone} onClose={() => setActDone(null)} /> : null}
        {role === "detail" && !loadError ? (
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
