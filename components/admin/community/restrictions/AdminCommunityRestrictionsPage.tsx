"use client";

/**
 * 활동 제한 회원 `/admin/community/restrictions` (설계 §C-11 · E-6).
 * 탭: 제한 중 / 기간 만료 / 해제됨 (활동 제한만) · 경고 기록 (경고는 기간이 없어 따로) · 전체.
 * 「제한 해제」 L2 → POST ./restrictions/:id/revoke · 「활동 제한 추가」 L2 → POST ./restrictions.
 * `?userId=` (작성자 화면에서 진입) → 그 회원만 + 추가 시트에 미리 선택 · `?sanctionId=` → 행 강조.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { COMMUNITY_ADMIN_REASON_MIN_LENGTH } from "@/lib/admin/community-admin/community-admin-reason";
import { COMMUNITY_RESTRICTION_DAY_OPTIONS } from "@/lib/admin/community-admin/community-sanction-input";
import { adminCommunityLabel } from "@/lib/admin/status-labels/community-status-labels";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunityAuthorCell,
  CommunityFilterBar,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunityStatusBadge,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  communityDetailHref,
  useCommunityListQuery,
  useCommunityQueryState,
  type CommunityListLoadState,
  type CommunitySheetSettle,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import {
  CommunityBannerView,
  communityActionFetch,
  communityAdminErrorText,
  communityWarningsOf,
  type CommunityBanner,
} from "@/components/admin/community/reports/community-report-admin-shared";

const RESTRICTION_EXTRAS = ["userId"] as const;

type TabKey = "active" | "expired" | "revoked" | "warnings" | "all";

const TABS: { key: TabKey; labelKey: MessageKey; status: string; kind: string }[] = [
  { key: "active", labelKey: "admin_community_restrict_tab_active", status: "active", kind: "community_restriction" },
  { key: "expired", labelKey: "admin_community_restrict_tab_expired", status: "expired", kind: "community_restriction" },
  { key: "revoked", labelKey: "admin_community_restrict_tab_revoked", status: "revoked", kind: "community_restriction" },
  { key: "warnings", labelKey: "admin_community_restrict_tab_warnings", status: "all", kind: "warning" },
  { key: "all", labelKey: "admin_community_restrict_tab_all", status: "all", kind: "" },
];

const EMPTY_TEXT: Record<TabKey, MessageKey> = {
  active: "admin_community_restrict_empty_active",
  expired: "admin_community_restrict_empty_expired",
  revoked: "admin_community_restrict_empty_revoked",
  warnings: "admin_community_restrict_empty_warnings",
  all: "admin_community_restrict_empty_all",
};

type RestrictionRow = {
  id: string;
  user_id: string;
  user_nickname: string | null;
  user_dibay_id: string | null;
  user_label: string;
  kind: string;
  restriction: string | null;
  status: "active" | "expired" | "revoked";
  start_at: string | null;
  end_at: string | null;
  reason: string | null;
  created_at: string | null;
  created_by_label: string | null;
  revoked_at: string | null;
  revoked_by_label: string | null;
  revoke_reason: string | null;
  source_report_id: string | null;
  source_report_kind: string | null;
  source_report_href: string | null;
};

type PickedMember = { id: string; nickname: string | null; handle: string | null };

const PHT = (iso: string | null | undefined) => (iso ? `${formatAdminManilaDateTime(iso)} PHT` : "—");

function resolveTab(raw: string): TabKey {
  return (TABS.find((t) => t.key === raw)?.key ?? "active") as TabKey;
}

function periodText(r: RestrictionRow, t: (key: MessageKey, vars?: Record<string, string | number>) => string): string {
  if (r.kind === "warning") return "—";
  const start = r.start_at ? formatAdminManilaDateTime(r.start_at) : "—";
  return r.end_at ? `${start} ~ ${formatAdminManilaDateTime(r.end_at)} PHT` : t("admin_community_restrict_period_permanent", { start });
}

export function AdminCommunityRestrictionsPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 탭(`tab`)·강조(`sanctionId`)는 조회 조건 밖 키 — [초기화] 후에도 탭 유지 */
  const qs = useCommunityQueryState();
  const lq = useCommunityListQuery({ extras: RESTRICTION_EXTRAS });
  /** 쓰기(활동 제한 추가·제한 해제) — 접근표 action community("moderation"). 서버 가드는 그대로. */
  const action = useAdminRouteAction("/admin/community/restrictions");
  const canModerate = action.allowed;

  const tab = resolveTab(qs.get("tab"));
  const tabDef = TABS.find((t) => t.key === tab) ?? TABS[0];
  const q = lq.query.q;
  const userId = lq.query.extras.userId;
  const sanctionId = qs.get("sanctionId");
  const page = lq.query.page;
  const pageSize = lq.query.size;

  const [rows, setRows] = useState<RestrictionRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Partial<Record<TabKey, number>>>({});
  const [loadErr, setLoadErr] = useState<{ code: string; status: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<CommunityBanner>(null);
  const [revokeRow, setRevokeRow] = useState<RestrictionRow | null>(null);
  const [adding, setAdding] = useState(false);
  const lastJson = useRef<Record<string, unknown>>({});

  const buildQuery = useCallback(
    (t: (typeof TABS)[number], limit: number, offset: number) => {
      const p = new URLSearchParams({ status: t.status, limit: String(limit), offset: String(offset) });
      if (t.kind) p.set("kind", t.kind);
      if (q) p.set("q", q);
      if (userId) p.set("userId", userId);
      return `/api/admin/community/restrictions?${p.toString()}`;
    },
    [q, userId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(buildQuery(tabDef, pageSize, (page - 1) * pageSize), {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; rows?: RestrictionRow[]; total?: number; error?: string };
      if (!res.ok || !j.ok) {
        // 실패해도 직전 목록은 지우지 않는다 (지시서 §8-5)
        setLoadErr({ code: j.error ?? `http_${res.status}`, status: res.status });
        return;
      }
      setLoadErr(null);
      setRows(j.rows ?? []);
      setTotal(Number(j.total ?? 0));
    } catch {
      setLoadErr({ code: "network_error", status: 0 });
      return;
    } finally {
      setLoading(false);
    }
    // 탭 건수 (총 건수만 — 1행 조회)
    const entries = await Promise.all(
      TABS.map(async (t) => {
        try {
          const r = await fetch(buildQuery(t, 1, 0), { credentials: "include", cache: "no-store" });
          const j = (await r.json().catch(() => ({}))) as { ok?: boolean; total?: number };
          return [t.key, r.ok && j.ok ? Number(j.total ?? 0) : undefined] as const;
        } catch {
          return [t.key, undefined] as const;
        }
      })
    );
    setCounts(Object.fromEntries(entries.filter(([, v]) => typeof v === "number")));
  }, [buildQuery, page, pageSize, tabDef]);

  useEffect(() => {
    void load();
  }, [load, lq.refreshKey]);

  const listState: CommunityListLoadState = loadErr
    ? { status: "error", data: rows, code: loadErr.code, httpStatus: loadErr.status }
    : loading
      ? { status: "loading", data: rows }
      : { status: "ok", data: rows };

  const onSettled = async (kind: CommunitySheetSettle, okText: (json: Record<string, unknown>) => CommunityBanner) => {
    setRevokeRow(null);
    setAdding(false);
    await load();
    if (kind === "stale") setBanner({ tone: "warning", text: t("admin_community_post_stale") });
    else if (kind === "gone") setBanner({ tone: "error", text: communityAdminErrorText("not_found", ko) });
    else setBanner(okText(lastJson.current));
  };

  return (
    <CommunityListShell
      title={t("admin_community_restrict_title")}
      description={t("admin_community_restrict_desc")}
      actions={
        <>
          <AdminActionButton variant="secondary" disabled={loading} onClick={() => void load()}>
            {t("admin_community_restrict_reload")}
          </AdminActionButton>
          <AdminActionButton
            variant="secondary"
            disabled={!canModerate}
            title={canModerate ? undefined : (action.reason ?? undefined)}
            onClick={() => {
              if (!canModerate) return;
              setAdding(true);
            }}
          >
            {t("admin_community_restrict_add")}
          </AdminActionButton>
        </>
      }
      banner={
        <>
          {!action.allowed && action.reason ? (
            <p className="sam-text-helper text-sam-muted" data-admin-action-denied="1">
              {t("admin_community_restrict_actions_disabled", { reason: action.reason })}
            </p>
          ) : null}
          <CommunityBannerView banner={banner} onClose={() => setBanner(null)} />
        </>
      }
      tabs={
        <CommunityTabs
          value={tab}
          onChange={(v) => qs.set({ tab: v === "active" ? null : v, sanctionId: null })}
          tabs={TABS.map((x) => ({ value: x.key, label: t(x.labelKey), count: counts[x.key] ?? null }))}
        />
      }
      filterBar={
        <CommunityFilterBar lq={lq} showPeriod={false} searchPlaceholder={t("admin_community_restrict_search_placeholder")} pending={loading}>
          {userId ? (
            <span className="inline-flex h-10 items-center gap-1 self-end rounded-full border border-sam-border bg-sam-app px-2 text-[12px] text-sam-fg">
              {t("admin_community_restrict_member_only")}
              <AdminActionButton variant="quiet" size="sm" aria-label={t("admin_community_restrict_member_clear")} onClick={() => lq.setExtra("userId", "")} className="h-auto! px-1!">
                ×
              </AdminActionButton>
            </span>
          ) : null}
        </CommunityFilterBar>
      }
      footer={<CommunityListPagination lq={lq} total={rows ? total : null} disabled={loading} />}
    >
      <CommunityListBody
        state={listState}
        empty={!rows || rows.length === 0}
        lq={lq}
        onRetry={() => void load()}
        emptyMessage={t(EMPTY_TEXT[tab])}
      >
        <CommunityTable head={[
          t("admin_community_restrict_col_member"),
          t("admin_community_restrict_col_kind"),
          t("admin_community_restrict_col_period"),
          t("admin_community_restrict_col_reason"),
          t("admin_community_restrict_col_actor"),
          t("admin_community_restrict_col_source"),
          t("admin_community_restrict_col_status"),
          t("admin_community_restrict_col_action"),
        ]}>
          {(rows ?? []).map((r) => (
            <tr
              key={r.id}
              data-sanction-row={r.id}
              className={`border-b border-sam-border-soft ${sanctionId === r.id ? "bg-sam-warning-soft" : ""}`}
            >
              <td className={COMMUNITY_TD}>
                <CommunityAuthorCell userId={r.user_id} nickname={r.user_nickname} handle={r.user_dibay_id} />
              </td>
              <td className={COMMUNITY_TD}>
                <span className="flex flex-col gap-0.5">
                  <CommunityStatusBadge domain="sanction_kind" value={r.kind} ko={ko} />
                  {r.kind !== "warning" ? (
                    <span className="sam-text-xxs text-sam-fg">
                      {adminCommunityLabel("restriction_scope", r.restriction, ko).label}
                    </span>
                  ) : null}
                </span>
              </td>
              <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{periodText(r, t)}</td>
              <td className={COMMUNITY_TD}>
                <p className="line-clamp-3 max-w-[16rem] whitespace-pre-wrap">{r.reason || "—"}</p>
                {r.revoked_at ? (
                  <p className="mt-1 max-w-[16rem] sam-text-xxs text-sam-muted">
                    {t("admin_community_restrict_revoked_line", { reason: r.revoke_reason || "—", by: r.revoked_by_label ?? t("admin_community_restrict_admin"), at: PHT(r.revoked_at) })}
                  </p>
                ) : null}
              </td>
              <td className={COMMUNITY_TD}>
                <span className="flex flex-col">
                  <span>{r.created_by_label ?? t("admin_community_restrict_admin")}</span>
                  <span className="sam-text-xxs text-sam-muted">
                    <CommunityTimeCell iso={r.created_at} />
                  </span>
                </span>
              </td>
              <td className={COMMUNITY_TD}>
                {r.source_report_href ? (
                  <Link href={communityDetailHref(r.source_report_href, qs.selfHref)} className="text-sam-info hover:underline">
                    {r.source_report_kind === "meeting_report"
                      ? t("admin_community_restrict_view_meeting_report")
                      : t("admin_community_restrict_view_report")}
                  </Link>
                ) : (
                  <span className="text-sam-muted">{t("admin_community_restrict_direct")}</span>
                )}
              </td>
              <td className={COMMUNITY_TD}>
                {r.kind === "warning" ? (
                  <AdminToneBadge tone="warning">{t("admin_community_restrict_warning_badge")}</AdminToneBadge>
                ) : (
                  <CommunityStatusBadge domain="restriction_state" value={r.status} ko={ko} />
                )}
              </td>
              <td className={COMMUNITY_TD}>
                {r.kind === "community_restriction" && r.status === "active" ? (
                  <AdminActionButton
                    variant="ghost"
                    size="sm"
                    disabled={!canModerate}
                    title={canModerate ? undefined : (action.reason ?? undefined)}
                    onClick={() => {
                      if (!canModerate) return;
                      setRevokeRow(r);
                    }}
                  >
                    {t("admin_community_restrict_lift")}
                  </AdminActionButton>
                ) : null}
                <AdminTechDetails ko={ko}>
                  <div>{t("admin_community_restrict_tech_id", { id: r.id })}</div>
                  <div>{t("admin_community_restrict_tech_user", { id: r.user_id })}</div>
                </AdminTechDetails>
              </td>
            </tr>
          ))}
        </CommunityTable>
      </CommunityListBody>

      {revokeRow ? (
        <CommunityActionSheet
          title={t("admin_community_restrict_lift_title")}
          rows={[
            { label: t("admin_community_restrict_col_member"), value: revokeRow.user_nickname?.trim() || revokeRow.user_label },
            { label: t("admin_community_restrict_row_scope"), value: adminCommunityLabel("restriction_scope", revokeRow.restriction, ko).label },
            { label: t("admin_community_restrict_col_period"), value: periodText(revokeRow, t) },
            { label: t("admin_community_restrict_row_reason"), value: revokeRow.reason || "—" },
          ]}
          notice={t("admin_community_restrict_lift_notice")}
          reason={{ minLength: COMMUNITY_ADMIN_REASON_MIN_LENGTH, placeholder: t("admin_community_restrict_lift_reason") }}
          confirmLabel={t("admin_community_restrict_lift_button")}
          onClose={() => setRevokeRow(null)}
          onSubmit={async (reason) => {
            if (!canModerate) return { ok: false, status: 403, code: "forbidden" };
            const { result, json } = await communityActionFetch(
              `/api/admin/community/restrictions/${encodeURIComponent(revokeRow.id)}/revoke`,
              "POST",
              { reason }
            );
            lastJson.current = json;
            return result;
          }}
          onSettled={(kind) =>
            void onSettled(kind, (json) => {
              const warn = communityWarningsOf(json, language);
              return { tone: warn.length ? "warning" : "success", text: t("admin_community_restrict_lifted"), extra: warn };
            })
          }
        />
      ) : null}

      {adding ? (
        <AddRestrictionSheet
          initialUserId={userId}
          canWrite={canModerate}
          lastJson={lastJson}
          onClose={() => setAdding(false)}
          onSettled={(kind) =>
            void onSettled(kind, (json) => {
              const warn = communityWarningsOf(json, language);
              if (json.duplicate) return { tone: "warning", text: t("admin_community_restrict_duplicate"), extra: warn };
              return { tone: warn.length ? "warning" : "success", text: t("admin_community_restrict_applied"), extra: warn };
            })
          }
        />
      ) : null}
    </CommunityListShell>
  );
}

/** 「활동 제한 추가」 시트 — 회원 선택(?userId= 미리 선택 또는 닉네임 검색) · 종류 · 범위 · 기간 · 사유 */
function AddRestrictionSheet({
  initialUserId,
  canWrite,
  lastJson,
  onClose,
  onSettled,
}: {
  initialUserId: string;
  canWrite: boolean;
  lastJson: { current: Record<string, unknown> };
  onClose: () => void;
  onSettled: (kind: CommunitySheetSettle) => void;
}) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [member, setMember] = useState<PickedMember | null>(null);
  const [memberErr, setMemberErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PickedMember[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [kind, setKind] = useState<"warning" | "community_restriction">("community_restriction");
  const [scope, setScope] = useState<"post" | "comment" | "all">("all");
  const [days, setDays] = useState("7");

  useEffect(() => {
    if (!initialUserId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/community/members/${encodeURIComponent(initialUserId)}?limit=1`, {
          credentials: "include",
          cache: "no-store",
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          profile?: { nickname?: string | null; dibay_id?: string | null } | null;
        };
        if (cancelled) return;
        if (res.ok && j.ok) {
          setMember({ id: initialUserId, nickname: j.profile?.nickname ?? null, handle: j.profile?.dibay_id ?? null });
        } else {
          setMemberErr(communityAdminErrorText(j.error ?? "not_found"));
        }
      } catch {
        if (!cancelled) setMemberErr(communityAdminErrorText("network_error"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialUserId]);

  const runSearch = async () => {
    const v = search.trim();
    if (!v) return;
    setSearching(true);
    setMemberErr(null);
    try {
      const res = await fetch(`/api/admin/community/members?q=${encodeURIComponent(v)}&limit=10`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        rows?: Array<{ user_id?: string; nickname?: string | null; dibay_id?: string | null }>;
      };
      if (res.ok && j.ok) {
        setResults(
          (j.rows ?? [])
            .filter((r) => r.user_id)
            .map((r) => ({ id: String(r.user_id), nickname: r.nickname ?? null, handle: r.dibay_id ?? null }))
        );
      } else {
        setResults(null);
        setMemberErr(communityAdminErrorText(j.error ?? `http_${res.status}`));
      }
    } catch {
      setMemberErr(communityAdminErrorText("network_error"));
    } finally {
      setSearching(false);
    }
  };

  const select = "rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 text-[13px] text-sam-fg";

  return (
    <CommunityActionSheet
      title={kind === "warning" ? t("admin_community_restrict_send_warning") : t("admin_community_restrict_restrict")}
      rows={[
        {
          label: t("admin_community_restrict_col_member"),
          value: member ? member.nickname?.trim() || t("admin_community_restrict_no_name") : t("admin_community_restrict_select_required"),
        },
        {
          label: t("admin_community_restrict_row_action"),
          value:
            kind === "warning"
              ? t("admin_community_restrict_warning")
              : `${adminCommunityLabel("restriction_scope", scope, ko).label} · ${
                  days === "perm" ? t("admin_community_restrict_permanent_short") : t("admin_community_restrict_days", { n: days })
                }`,
        },
      ]}
      notice={
        kind === "warning"
          ? t("admin_community_restrict_warning_notice")
          : t("admin_community_restrict_restrict_notice")
      }
      reason={{ minLength: COMMUNITY_ADMIN_REASON_MIN_LENGTH, placeholder: t("admin_community_restrict_reason_placeholder") }}
      ready={Boolean(member) && canWrite}
      destructive={kind === "community_restriction"}
      confirmLabel={kind === "warning" ? t("admin_community_restrict_send_warning") : t("admin_community_restrict_restrict")}
      onClose={onClose}
      onSubmit={async (reason) => {
        if (!canWrite) return { ok: false, status: 403, code: "forbidden" };
        if (!member) return { ok: false, status: 400, code: "invalid_user_id" };
        const { result, json } = await communityActionFetch("/api/admin/community/restrictions", "POST", {
          userId: member.id,
          kind,
          ...(kind === "community_restriction" ? { restriction: scope, days: days === "perm" ? null : Number(days) } : {}),
          reason,
        });
        lastJson.current = json;
        return result;
      }}
      onSettled={onSettled}
    >
      <div className="space-y-2">
        <span className="text-[12px] font-semibold text-sam-fg">{t("admin_community_restrict_member_label")}</span>
        {member ? (
          <div className="flex items-center justify-between gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px]">
            <CommunityAuthorCell userId={member.id} nickname={member.nickname} handle={member.handle} />
            <AdminActionButton variant="quiet" size="sm" className="h-auto! px-1!" onClick={() => setMember(null)}>
              {t("admin_community_restrict_change_member")}
            </AdminActionButton>
          </div>
        ) : (
          <>
            <div className="flex gap-1">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runSearch();
                  }
                }}
                placeholder={t("admin_community_restrict_member_search")}
                className={`${select} flex-1`}
              />
              <AdminActionButton variant="secondary" disabled={searching || !search.trim()} onClick={() => void runSearch()}>
                {searching ? t("admin_community_restrict_searching") : t("admin_community_restrict_search_button")}
              </AdminActionButton>
            </div>
            {results ? (
              results.length === 0 ? (
                <p className="text-[12px] text-sam-muted">
                  {t("admin_community_restrict_member_not_found")}
                </p>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {results.map((m) => (
                    <li key={m.id}>
                      <AdminActionButton
                        variant="secondary"
                        size="sm"
                        onClick={() => setMember(m)}
                        className="w-full justify-start! font-normal! text-left"
                      >
                        {m.nickname?.trim() || t("admin_community_restrict_no_name")}
                        {m.handle ? <span className="ml-2 sam-text-xxs text-sam-muted">@{m.handle}</span> : null}
                      </AdminActionButton>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </>
        )}
        {memberErr ? <p className="text-[12px] text-sam-danger">{memberErr}</p> : null}
      </div>
      <fieldset className="space-y-1">
        <legend className="text-[12px] font-semibold text-sam-fg">{t("admin_community_restrict_kind_label")}</legend>
        <label className="mr-4 inline-flex items-center gap-1.5 text-[13px]">
          <input type="radio" checked={kind === "community_restriction"} onChange={() => setKind("community_restriction")} />
          {t("admin_community_restrict_kind_restriction")}
        </label>
        <label className="inline-flex items-center gap-1.5 text-[13px]">
          <input type="radio" checked={kind === "warning"} onChange={() => setKind("warning")} />
          {t("admin_community_restrict_kind_warning")}
        </label>
      </fieldset>
      {kind === "community_restriction" ? (
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-sam-muted">
            {t("admin_community_restrict_field_scope")}
            <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className={select}>
              <option value="post">{t("admin_community_restrict_scope_post")}</option>
              <option value="comment">{t("admin_community_restrict_scope_comment")}</option>
              <option value="all">{t("admin_community_restrict_scope_all")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-sam-muted">
            {t("admin_community_restrict_field_period")}
            <select value={days} onChange={(e) => setDays(e.target.value)} className={select}>
              {COMMUNITY_RESTRICTION_DAY_OPTIONS.map((d) => (
                <option key={d} value={String(d)}>
                  {t("admin_community_restrict_days_n", { n: d })}
                </option>
              ))}
              <option value="perm">{t("admin_community_restrict_permanent")}</option>
            </select>
          </label>
        </div>
      ) : null}
    </CommunityActionSheet>
  );
}
