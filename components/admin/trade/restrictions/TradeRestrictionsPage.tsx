"use client";

/**
 * 거래 활동 제한 `/admin/trade/restrictions` (설계 v2 §C-5).
 * 탭: 진행 중 / 만료 / 해제 / 전체 · 필터: 종류(경고·거래 활동 제한) · 닉네임 · 특정 회원(?userId=).
 * URL: tab(탭) · kind · q · userId · page · size(20/50/100)
 * 「해제」 2단계 확인 → POST ./restrictions/:id/revoke · 「제한 추가」 → POST ./restrictions.
 * 추가·해제 시트는 판매자·구매자 상세에서도 그대로 쓴다.
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunityFilterBar,
  CommunityFilterField,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunitySelect,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  useCommunityListQuery,
  useCommunityQueryState,
  type CommunitySheetSettle,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import {
  CommunityBannerView,
  communityActionFetch,
  communityWarningsOf,
  type CommunityBanner,
} from "@/components/admin/community/reports/community-report-admin-shared";
import { TradeMemberCell, tradeDetailHref, tradeErrorText } from "@/components/admin/trade/kit/TradeAdminKit";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import type { MessageKey } from "@/lib/i18n/messages";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

const REASON_MIN = 2;

type Rec = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/* ───────── 공용 라벨·부품 (신고·회원 상세에서도 사용) ───────── */

const TRADE_RESTRICTION_SCOPE_KEY: Record<string, MessageKey> = {
  post: "admin_trade_restrict_scope_post",
  chat: "admin_trade_audit_target_chat",
  all: "admin_trade_restrict_scope_all",
};

/** 제한 범위 문구 — 모르는 값이면 null */
export function tradeRestrictionScopeLabel(t: Translate, scope: string | null | undefined): string | null {
  const key = TRADE_RESTRICTION_SCOPE_KEY[s(scope)];
  return key ? t(key) : null;
}

export const TRADE_RESTRICTION_DAY_SELECT: { value: string; labelKey: MessageKey }[] = [
  { value: "1", labelKey: "admin_trade_restrict_days_1" },
  { value: "3", labelKey: "admin_trade_restrict_days_3" },
  { value: "7", labelKey: "admin_trade_restrict_days_7" },
  { value: "30", labelKey: "admin_trade_restrict_days_30" },
  { value: "perm", labelKey: "admin_trade_restrict_days_perm" },
];

/** 기간 선택값 문구 (「영구」 또는 「N일」) */
export function tradeRestrictionDaysLabel(t: Translate, days: string): string {
  const o = TRADE_RESTRICTION_DAY_SELECT.find((x) => x.value === days);
  return o ? t(o.labelKey) : t("admin_trade_restrict_days_n", { n: days });
}

const SANCTION_KIND_LABEL: Record<string, MessageKey> = {
  warning: "admin_trade_restrict_badge_warning",
  trade_restriction: "admin_trade_restrict_title",
  community_restriction: "admin_trade_restrict_kind_community",
  chat_ban: "admin_trade_restrict_kind_chat_ban",
  temp_suspend: "admin_trade_members_tab_suspended",
  permanent_ban: "admin_trade_restrict_kind_banned",
};

export function tradeSanctionKindLabel(t: Translate, kind: string | null | undefined): string {
  return t(SANCTION_KIND_LABEL[s(kind)] ?? "admin_trade_audit_act_other");
}

export function tradeSanctionStatusOf(r: Rec): "active" | "expired" | "revoked" {
  const st = s(r.status);
  if (st === "active" || st === "expired" || st === "revoked") return st;
  if (r.revoked_at) return "revoked";
  if (r.end_at && Date.parse(s(r.end_at)) <= Date.now()) return "expired";
  return "active";
}

export function tradeSanctionPeriodText(t: Translate, r: Rec): string {
  if (s(r.sanction_type) === "warning") return "—";
  const start = r.start_at ? formatAdminManilaDateTime(s(r.start_at)) : "—";
  return r.end_at ? `${start} ~ ${formatAdminManilaDateTime(s(r.end_at))} PHT` : t("admin_trade_restrict_period_perm", { start });
}

export function TradeSanctionStateBadge({ row }: { row: Rec }) {
  const { t } = useI18n();
  if (s(row.sanction_type) === "warning") return <AdminToneBadge tone="warning">{t("admin_trade_restrict_badge_warning")}</AdminToneBadge>;
  const st = tradeSanctionStatusOf(row);
  if (st === "active") return <AdminToneBadge tone="danger">{t("admin_trade_restrict_badge_active")}</AdminToneBadge>;
  if (st === "revoked") return <AdminToneBadge tone="success">{t("admin_trade_restrict_badge_revoked")}</AdminToneBadge>;
  return <AdminToneBadge tone="neutral">{t("admin_trade_restrict_badge_expired")}</AdminToneBadge>;
}

export type TradeRestrictionRow = {
  id: string;
  user_id: string;
  user_label: string | null;
  sanction_type: string;
  restriction: string | null;
  start_at: string | null;
  end_at: string | null;
  reason: string | null;
  created_by_label: string | null;
  created_at: string | null;
  revoked_at: string | null;
  revoked_by_label: string | null;
  revoke_reason: string | null;
  source_report_id: string | null;
  status: "active" | "expired" | "revoked";
};

export function tradeSettleBanner(t: Translate, kind: CommunitySheetSettle, okText: string, json: Rec): CommunityBanner {
  if (kind === "stale") return { tone: "warning", text: t("admin_community_post_stale") };
  if (kind === "gone") return { tone: "error", text: tradeErrorText("not_found") };
  const warn = communityWarningsOf(json, getRuntimeAppLanguage());
  if (json.duplicate === true) return { tone: "warning", text: t("admin_trade_restrict_duplicate"), extra: warn };
  return { tone: warn.length ? "warning" : "success", text: okText, extra: warn };
}

/** 「해제」 시트 */
export function TradeRevokeRestrictionSheet({
  row,
  onClose,
  onSettled,
}: {
  row: TradeRestrictionRow | Rec;
  onClose: () => void;
  onSettled: (banner: CommunityBanner) => void;
}) {
  const { t } = useI18n();
  const lastJson = useRef<Rec>({});
  const r = row as Rec;
  return (
    <CommunityActionSheet
      title={s(r.sanction_type) === "warning" ? t("admin_trade_restrict_revoke_warning_title") : t("admin_trade_restrict_revoke_title")}
      rows={[
        { label: t("admin_trade_restrict_member"), value: s(r.user_label).trim() || t("admin_trade_restrict_member") },
        {
          label: t("admin_trade_restrict_kind_scope"),
          value: `${tradeSanctionKindLabel(t, s(r.sanction_type))}${
            r.restriction ? ` · ${tradeRestrictionScopeLabel(t, s(r.restriction)) ?? t("admin_trade_restrict_scope_unknown")}` : ""
          }`,
        },
        { label: t("admin_trade_post_ads_th_period"), value: tradeSanctionPeriodText(t, r) },
        { label: t("admin_trade_restrict_reason_label"), value: s(r.reason) || "—" },
      ]}
      notice={t("admin_trade_restrict_revoke_notice")}
      reason={{ minLength: REASON_MIN, placeholder: t("admin_trade_restrict_revoke_reason_ph") }}
      confirmLabel={t("admin_trade_restrict_revoke_btn")}
      onClose={onClose}
      onSubmit={async (reason) => {
        const { result, json } = await communityActionFetch(
          `/api/admin/trade/restrictions/${encodeURIComponent(s(r.id))}/revoke`,
          "POST",
          { reason }
        );
        lastJson.current = json;
        return result;
      }}
      onSettled={(kind) => onSettled(tradeSettleBanner(t, kind, t("admin_trade_restrict_revoked_ok"), lastJson.current))}
    />
  );
}

type PickedMember = { id: string; label: string };

/** 「제한 추가」 시트 — 회원 선택(미리 선택 또는 닉네임 검색) · 종류 · 범위 · 기간 · 사유 */
export function TradeAddRestrictionSheet({
  initialMember,
  lockMember = false,
  onClose,
  onSettled,
}: {
  initialMember?: PickedMember | null;
  /** 회원 상세에서 열 때 — 다른 회원 선택 숨김 */
  lockMember?: boolean;
  onClose: () => void;
  onSettled: (banner: CommunityBanner) => void;
}) {
  const { t } = useI18n();
  const [member, setMember] = useState<PickedMember | null>(initialMember ?? null);
  const [memberErr, setMemberErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PickedMember[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [kind, setKind] = useState<"warning" | "trade_restriction">("trade_restriction");
  const [scope, setScope] = useState<"post" | "chat" | "all">("all");
  const [days, setDays] = useState("7");
  const lastJson = useRef<Rec>({});

  const runSearch = async () => {
    const v = search.trim();
    if (!v) return;
    setSearching(true);
    setMemberErr(null);
    try {
      const res = await fetch(`/api/admin/trade/members?q=${encodeURIComponent(v)}&limit=20`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        rows?: Array<{ user_id?: string; label?: string | null }>;
      };
      if (res.ok && j.ok) {
        setResults(
          (j.rows ?? []).filter((r) => r.user_id).map((r) => ({ id: String(r.user_id), label: r.label?.trim() || t("admin_trade_kit_no_name") }))
        );
      } else {
        setResults(null);
        setMemberErr(tradeErrorText(j.error ?? `http_${res.status}`));
      }
    } catch {
      setMemberErr(tradeErrorText("server_error"));
    } finally {
      setSearching(false);
    }
  };

  const select = "rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 text-[13px] text-sam-fg";

  return (
    <CommunityActionSheet
      title={kind === "warning" ? t("admin_trade_restrict_send_warning") : t("admin_trade_restrict_title")}
      rows={[
        { label: t("admin_trade_restrict_member"), value: member ? member.label : t("admin_trade_restrict_pick_needed") },
        {
          label: t("admin_trade_audit_th_action"),
          value:
            kind === "warning"
              ? t("admin_trade_restrict_badge_warning")
              : `${tradeRestrictionScopeLabel(t, scope)} · ${tradeRestrictionDaysLabel(t, days)}`,
        },
      ]}
      notice={
        kind === "warning"
          ? t("admin_trade_restrict_warning_notice")
          : t("admin_trade_restrict_restrict_notice")
      }
      reason={{ minLength: REASON_MIN, placeholder: t("admin_trade_restrict_reason_ph") }}
      ready={Boolean(member)}
      destructive={kind === "trade_restriction"}
      confirmLabel={kind === "warning" ? t("admin_trade_restrict_send_warning") : t("admin_trade_restrict_title")}
      onClose={onClose}
      onSubmit={async (reason) => {
        if (!member) return { ok: false, status: 400, code: "invalid_user_id" };
        const { result, json } = await communityActionFetch("/api/admin/trade/restrictions", "POST", {
          userId: member.id,
          kind,
          ...(kind === "trade_restriction" ? { restriction: scope, days: days === "perm" ? null : Number(days) } : {}),
          reason,
        });
        lastJson.current = json;
        return result;
      }}
      onSettled={(k) =>
        onSettled(
          tradeSettleBanner(t, k, kind === "warning" ? t("admin_trade_restrict_warning_sent") : t("admin_trade_restrict_restricted_ok"), lastJson.current)
        )
      }
    >
      <div className="space-y-2">
        <span className="text-[12px] font-semibold text-sam-fg">{t("admin_trade_restrict_member")}</span>
        {member ? (
          <div className="flex items-center justify-between gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px]">
            <span className="font-medium text-sam-fg">{member.label}</span>
            {lockMember ? null : (
              <AdminActionButton variant="quiet" size="sm" onClick={() => setMember(null)}>
                {t("admin_trade_restrictions_pick_other_member")}
              </AdminActionButton>
            )}
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
                placeholder={t("admin_trade_restrict_nickname")}
                className={`${select} flex-1`}
              />
              <AdminActionButton variant="secondary" disabled={searching || !search.trim()} onClick={() => void runSearch()}>
                {searching ? t("admin_trade_restrict_searching") : t("admin_trade_restrict_search")}
              </AdminActionButton>
            </div>
            {results ? (
              results.length === 0 ? (
                <p className="text-[12px] text-sam-muted">{t("admin_trade_restrict_no_member")}</p>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {results.map((m) => (
                    <li key={m.id}>
                      <AdminActionButton
                        variant="secondary"
                        size="sm"
                        onClick={() => setMember(m)}
                        className="w-full !justify-start text-left font-normal"
                      >
                        {m.label}
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
        <legend className="text-[12px] font-semibold text-sam-fg">{t("admin_trade_restrict_kind_legend")}</legend>
        <label className="mr-4 inline-flex items-center gap-1.5 text-[13px]">
          <input type="radio" checked={kind === "trade_restriction"} onChange={() => setKind("trade_restriction")} />
          {t("admin_trade_activity_restriction")}
        </label>
        <label className="inline-flex items-center gap-1.5 text-[13px]">
          <input type="radio" checked={kind === "warning"} onChange={() => setKind("warning")} />
          {t("admin_trade_restrictions_warning")}
        </label>
      </fieldset>
      {kind === "trade_restriction" ? (
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-sam-muted">
            {t("admin_trade_restrictions_field_scope")}
            <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className={select}>
              {(["post", "chat", "all"] as const).map((v) => (
                <option key={v} value={v}>
                  {tradeRestrictionScopeLabel(t, v)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-sam-muted">
            {t("admin_trade_restrictions_field_period")}
            <select value={days} onChange={(e) => setDays(e.target.value)} className={select}>
              {TRADE_RESTRICTION_DAY_SELECT.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </CommunityActionSheet>
  );
}

/* ───────── 목록 ───────── */

type TabKey = "active" | "expired" | "revoked" | "all";
const TABS: { value: TabKey; labelKey: MessageKey }[] = [
  { value: "active", labelKey: "admin_trade_restrict_badge_active" },
  { value: "expired", labelKey: "admin_trade_restrict_badge_expired" },
  { value: "revoked", labelKey: "admin_trade_restrict_badge_revoked" },
  { value: "all", labelKey: "common_all" },
];
const EMPTY_TEXT: Record<TabKey, MessageKey> = {
  active: "admin_trade_restrict_empty_active",
  expired: "admin_trade_restrict_empty_expired",
  revoked: "admin_trade_restrict_empty_revoked",
  all: "admin_trade_restrict_empty_all",
};
const KIND_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: "", labelKey: "admin_trade_restrict_kind_all" },
  { value: "warning", labelKey: "admin_trade_restrict_badge_warning" },
  { value: "trade_restriction", labelKey: "admin_trade_restrict_title" },
];

type ListResponse = { ok?: boolean; error?: string; total?: number; rows?: TradeRestrictionRow[] };

const LIST_EXTRAS = ["kind", "userId"] as const;

export function TradeRestrictionsPage() {
  const { t } = useI18n();
  /** `tab` 은 조회 조건 밖 키 — [초기화] 후에도 유지, 탭을 바꾸면 1쪽으로 */
  const qs = useCommunityQueryState();
  const lq = useCommunityListQuery({ extras: LIST_EXTRAS });
  const tabRaw = qs.get("tab");
  const tab: TabKey = (TABS.find((t) => t.value === tabRaw)?.value ?? "active") as TabKey;
  const kind = lq.query.extras.kind;
  const userId = lq.query.extras.userId;
  const [banner, setBanner] = useState<CommunityBanner>(null);
  const [revokeRow, setRevokeRow] = useState<TradeRestrictionRow | null>(null);
  const [adding, setAdding] = useState(false);

  const buildUrl = (status: TabKey, limit?: number) => {
    const p = lq.apiParams({ period: false });
    p.set("status", status);
    // 탭 건수 — 총 건수만 (가장 작은 페이지 크기로 1쪽 조회)
    if (limit !== undefined) {
      p.set("limit", String(limit));
      p.set("offset", "0");
    }
    return `/api/admin/trade/restrictions?${p.toString()}`;
  };

  const { state, reload } = useCommunityAdminJson<ListResponse>(buildUrl(tab));
  const cActive = useCommunityAdminJson<ListResponse>(buildUrl("active", 20));
  const cExpired = useCommunityAdminJson<ListResponse>(buildUrl("expired", 20));
  const cRevoked = useCommunityAdminJson<ListResponse>(buildUrl("revoked", 20));
  const cAll = useCommunityAdminJson<ListResponse>(buildUrl("all", 20));
  const countOf = (x: typeof cAll) => (x.state.status === "ok" ? Number(x.state.data.total ?? 0) : null);
  const counts: Record<TabKey, number | null> = {
    active: countOf(cActive),
    expired: countOf(cExpired),
    revoked: countOf(cRevoked),
    all: countOf(cAll),
  };

  const rows = state.data?.rows ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;

  const reloadAll = () => {
    reload();
    cActive.reload();
    cExpired.reload();
    cRevoked.reload();
    cAll.reload();
  };
  const afterSheet = (b: CommunityBanner) => {
    setRevokeRow(null);
    setAdding(false);
    setBanner(b);
    reloadAll();
  };

  const initialMember = userId
    ? { id: userId, label: rows.find((r) => r.user_id === userId)?.user_label?.trim() || t("admin_trade_audit_selected_member") }
    : null;

  return (
    <CommunityListShell
      title={t("admin_trade_restrict_title")}
      description={t("admin_trade_restrict_desc")}
      actions={
        <>
          <AdminActionButton variant="secondary" onClick={reloadAll}>
            {t("admin_trade_restrictions_refresh")}
          </AdminActionButton>
          <AdminActionButton variant="secondary" onClick={() => setAdding(true)}>
            {t("admin_trade_add_restriction")}
          </AdminActionButton>
        </>
      }
      banner={<CommunityBannerView banner={banner} onClose={() => setBanner(null)} />}
      tabs={
        <CommunityTabs
          value={tab}
          onChange={(v) => qs.set({ tab: v === "active" ? null : v })}
          tabs={TABS.map((x) => ({ value: x.value, label: t(x.labelKey), count: counts[x.value] }))}
        />
      }
      filterBar={
        <CommunityFilterBar lq={lq} showPeriod={false} searchPlaceholder={t("admin_trade_restrict_nickname")} pending={state.status === "loading"}>
          <CommunityFilterField label={t("admin_trade_restrict_kind_legend")}>
            <CommunitySelect value={kind} onChange={(v) => lq.setExtra("kind", v)} options={KIND_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))} />
          </CommunityFilterField>
          {userId ? (
            <CommunityFilterField label={t("admin_trade_restrict_member")}>
              <span className="flex h-10 items-center gap-2 text-[13px] text-sam-fg">
                {t("admin_trade_restrictions_member_only")}
                <AdminActionButton variant="quiet" size="sm" className="h-auto! px-1!" onClick={() => lq.setExtra("userId", "")}>
                  {t("admin_trade_filter_clear")}
                </AdminActionButton>
              </span>
            </CommunityFilterField>
          ) : null}
        </CommunityFilterBar>
      }
      footer={<CommunityListPagination lq={lq} total={total} disabled={state.status === "loading"} />}
    >
      <CommunityListBody state={state} empty={rows.length === 0} lq={lq} onRetry={reload} emptyMessage={t(EMPTY_TEXT[tab])}>
        <CommunityTable head={[t("admin_trade_restrict_member"), t("admin_trade_restrict_kind_legend"), t("admin_trade_restrict_th_scope"), t("admin_trade_post_ads_th_period"), t("admin_trade_flow_th_reason"), t("admin_trade_audit_actor"), t("admin_trade_restrict_th_source_report"), t("admin_trade_th_status"), t("admin_trade_restrict_th_handle")]}>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-sam-border-soft">
              <td className={COMMUNITY_TD}>
                <TradeMemberCell userId={r.user_id} label={r.user_label} returnTo={lq.selfHref} />
              </td>
              <td className={COMMUNITY_TD}>{tradeSanctionKindLabel(t, r.sanction_type)}</td>
              <td className={COMMUNITY_TD}>
                {r.sanction_type === "warning" ? (
                  <span className="text-sam-muted">—</span>
                ) : (
                  tradeRestrictionScopeLabel(t, r.restriction) ?? t("admin_trade_restrict_scope_unknown")
                )}
              </td>
              <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{tradeSanctionPeriodText(t, r)}</td>
              <td className={COMMUNITY_TD}>
                <p className="line-clamp-3 max-w-[16rem] whitespace-pre-wrap">{r.reason || "—"}</p>
                {r.revoked_at ? (
                  <p className="mt-1 max-w-[16rem] sam-text-xxs text-sam-muted">
                    {t("admin_trade_restrictions_revoked_line", { reason: r.revoke_reason || "—", by: r.revoked_by_label ?? t("admin_trade_confirm_source_admin"), at: `${formatAdminManilaDateTime(r.revoked_at)} PHT` })}
                  </p>
                ) : null}
              </td>
              <td className={COMMUNITY_TD}>
                <span className="flex flex-col">
                  <span>{r.created_by_label ?? t("admin_trade_confirm_source_admin")}</span>
                  <span className="sam-text-xxs text-sam-muted">
                    <CommunityTimeCell iso={r.created_at} />
                  </span>
                </span>
              </td>
              <td className={COMMUNITY_TD}>
                {r.source_report_id ? (
                  <Link
                    href={tradeDetailHref(
                      `/admin/trade/reports?tab=all&reportId=${encodeURIComponent(r.source_report_id)}`,
                      lq.selfHref
                    )}
                    className="text-sam-primary hover:underline"
                  >
                    {t("admin_trade_restrictions_view_report")}
                  </Link>
                ) : (
                  <span className="text-sam-muted">{t("admin_trade_restrict_direct")}</span>
                )}
              </td>
              <td className={COMMUNITY_TD}>
                <TradeSanctionStateBadge row={r} />
              </td>
              <td className={COMMUNITY_TD}>
                {r.status === "active" ? (
                  <AdminActionButton variant="secondary" size="sm" onClick={() => setRevokeRow(r)}>
                    {t("admin_trade_restrictions_revoke")}
                  </AdminActionButton>
                ) : null}
                <AdminTechDetails ko>
                  <div>{t("admin_trade_restrict_id", { id: r.id })}</div>
                  <div>{t("admin_trade_restrict_member_id", { id: r.user_id })}</div>
                </AdminTechDetails>
              </td>
            </tr>
          ))}
        </CommunityTable>
      </CommunityListBody>

      {revokeRow ? (
        <TradeRevokeRestrictionSheet row={revokeRow} onClose={() => setRevokeRow(null)} onSettled={afterSheet} />
      ) : null}
      {adding ? (
        <TradeAddRestrictionSheet initialMember={initialMember} onClose={() => setAdding(false)} onSettled={afterSheet} />
      ) : null}
    </CommunityListShell>
  );
}
