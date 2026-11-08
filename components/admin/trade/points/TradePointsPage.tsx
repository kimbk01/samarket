"use client";

/**
 * 거래 포인트 (설계 v2 §G-2) — 거래 홍보 주문·이전 거래 광고·관리자 지급/회수 내역 + 「포인트 지급·회수」.
 * 지급·회수: 회원 선택 → 현재 잔액 → 지급/회수·금액·사유 → 2단계 확인. 확인 화면을 열 때 멱등 키를 1회 만들고 재시도에 재사용.
 * URL: type · entryType · userId · from/to(PHT) · period(호환 프리셋 · all=전체 기간, 없으면 최근 30일) · page · size(20/50/100)
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useState } from "react";
import {
  COMMUNITY_TD,
  CommunityFilterBar,
  CommunityFilterField,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunitySelect,
  CommunityTable,
  CommunityTimeCell,
  useCommunityListQuery,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { useCommunityAdminJson, type CommunityBannerState } from "@/components/admin/community/members/use-community-admin-data";
import { AdminResultBanner, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminPointBucketLine, type AdminPointBucketSums } from "@/lib/admin/points/admin-point-bucket-line";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { AdminFormSheet } from "@/components/admin/AdminFormSheet";
import { DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  TradeDefaultPeriodField,
  tradeListPeriodText,
  TradeMemberCell,
  formatTradePoints,
  tradeErrorText,
  tradeListApiParams,
} from "@/components/admin/trade/kit/TradeAdminKit";

const LIST_EXTRAS = ["type", "entryType", "userId"] as const;

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

const TYPE_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: "", labelKey: "admin_trade_points_type_all" },
  { value: "promotion_order", labelKey: "admin_trade_points_type_promo_order" },
  { value: "trade_post_ad", labelKey: "admin_trade_points_type_old_ad" },
  { value: "admin_manual", labelKey: "admin_trade_points_type_admin_manual" },
];
const TYPE_LABEL: Record<string, MessageKey> = {
  promotion_order: "admin_trade_points_type_promo_order",
  trade_post_ad: "admin_trade_points_type_old_ad",
  admin_manual: "admin_trade_confirm_source_admin",
};

const ENTRY_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: "", labelKey: "admin_trade_restrict_kind_all" },
  { value: "ad_hold", labelKey: "admin_trade_points_entry_hold" },
  { value: "ad_purchase", labelKey: "admin_trade_points_entry_purchase" },
  { value: "ad_hold_release", labelKey: "admin_trade_points_entry_hold_release" },
  { value: "spend", labelKey: "admin_trade_points_entry_spend" },
  { value: "promotion_extend", labelKey: "admin_trade_points_entry_extend" },
  { value: "refund", labelKey: "admin_trade_points_entry_refund" },
  { value: "admin_credit", labelKey: "admin_trade_points_op_credit" },
  { value: "admin_debit", labelKey: "admin_trade_points_op_debit" },
];
const ENTRY_LABEL: Record<string, MessageKey> = Object.fromEntries(ENTRY_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.labelKey]));

function pointTypeLabel(t: Translate, relatedType: string | null, entryType: string | null): string {
  const r = t(TYPE_LABEL[String(relatedType ?? "")] ?? "admin_trade_audit_target_other");
  const e = ENTRY_LABEL[String(entryType ?? "")];
  return e ? `${r} ${t(e)}` : r;
}

type LedgerRow = {
  id: string;
  createdAt: string;
  userId: string | null;
  userNickname: string | null;
  entryType: string | null;
  amount: number | null;
  balanceAfter: number | null;
  relatedType: string | null;
  relatedId: string | null;
  description: string | null;
  actorType: string | null;
  actorNickname: string | null;
};

type PointsResponse = {
  ok?: boolean;
  error?: string;
  total?: number | null;
  sums?: { count: number; amountIn: number; amountOut: number } | null;
  /** 칸별 합계 (충전·지급·사용·회수·보류 중) */
  buckets?: AdminPointBucketSums | null;
  promoOrderIdCapped?: boolean;
  rows?: LedgerRow[];
};

function actorLabel(t: Translate, r: LedgerRow): string {
  if (r.actorNickname) return r.actorNickname;
  if (r.actorType === "admin") return t("admin_trade_confirm_source_admin");
  if (r.actorType === "user") return t("admin_trade_points_member");
  return t("admin_trade_audit_system");
}

export function TradePointsPage() {
  const { t, language } = useI18n();
  const q = useCommunityListQuery({ extras: LIST_EXTRAS });
  const [adjustOpen, setAdjustOpen] = useState(false);
  // FN-01: 지급·회수 = 중앙과 같은 `point` 키 (접근표 /admin/trade/points action) — 서버 가드가 최종 판정
  const adjustAction = useAdminRouteAction("/admin/trade/points");
  const [banner, setBanner] = useState<CommunityBannerState>(null);
  const { type, entryType, userId } = q.query.extras;

  const params = tradeListApiParams(q, { defaultPeriod: "30d" });
  const { state, reload } = useCommunityAdminJson<PointsResponse>(`/api/admin/trade/points?${params.toString()}`);
  const rows = state.data?.rows ?? [];
  const total = state.status === "ok" ? (typeof state.data.total === "number" ? state.data.total : null) : null;
  const sums = state.status === "ok" ? state.data.sums ?? null : null;
  const memberName = userId ? rows.find((r) => r.userId === userId)?.userNickname : null;

  return (
    <CommunityListShell
      title={t("admin_trade_points_title")}
      description={t("admin_trade_points_desc")}
      actions={
        <AdminActionButton
          variant="secondary"
          disabled={!adjustAction.allowed}
          title={adjustAction.reason ?? undefined}
          onClick={() => setAdjustOpen(true)}
        >
          {t("admin_trade_points_adjust_heading")}
        </AdminActionButton>
      }
      banner={
        <div className="space-y-1">
          <AdminResultBanner ko result={banner} onClose={() => setBanner(null)} />
          {state.status === "ok" ? (
            <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px] text-sam-fg">
              {sums
                ? t("admin_trade_points_sums", {
                    count: formatAdminNumber(sums.count),
                    in: formatAdminNumber(sums.amountIn),
                    out: formatAdminNumber(Math.abs(sums.amountOut)),
                  })
                : t("admin_trade_points_sums_unknown")}
            </p>
          ) : null}
          {state.status === "ok" && state.data.buckets ? (
            <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px] text-sam-fg" data-admin-point-buckets="1">
              {t("admin_trade_points_buckets", { line: formatAdminPointBucketLine(state.data.buckets, formatAdminNumber, language !== "en") })}
            </p>
          ) : null}
          {state.status === "ok" && state.data.promoOrderIdCapped ? (
            <p className="text-[12px] text-sam-warning">{t("admin_trade_points_old_orders_note")}</p>
          ) : null}
        </div>
      }
      filterBar={
        <CommunityFilterBar lq={q} showSearch={false} pending={state.status === "loading"}>
          <TradeDefaultPeriodField lq={q} />
          <CommunityFilterField label={t("admin_trade_points_th_type")}>
            <CommunitySelect value={type} onChange={(v) => q.setExtra("type", v)} options={TYPE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))} />
          </CommunityFilterField>
          <CommunityFilterField label={t("admin_trade_restrict_kind_legend")}>
            <CommunitySelect value={entryType} onChange={(v) => q.setExtra("entryType", v)} options={ENTRY_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))} />
          </CommunityFilterField>
          {userId ? (
            <CommunityFilterField label={t("admin_trade_points_member")}>
              <span className="flex h-10 items-center gap-2 text-[13px] text-sam-fg">
                {memberName || t("admin_trade_audit_selected_member")}
                <AdminActionButton variant="quiet" size="sm" className="h-auto! px-1!" onClick={() => q.setExtra("userId", "")}>
                  {t("admin_trade_filter_clear")}
                </AdminActionButton>
              </span>
            </CommunityFilterField>
          ) : null}
        </CommunityFilterBar>
      }
      footer={<CommunityListPagination lq={q} total={total} disabled={state.status === "loading"} />}
    >
      <CommunityListBody state={state} empty={rows.length === 0} lq={q} onRetry={reload} emptyMessage={t("admin_trade_points_empty", { period: tradeListPeriodText(params) })}>
        <CommunityTable head={[t("admin_trade_th_time"), t("admin_trade_points_member"), t("admin_trade_points_th_type"), t("admin_trade_th_points"), t("admin_trade_points_th_balance"), t("admin_trade_points_th_detail"), t("admin_trade_audit_actor")]}>
          {rows.map((r) => {
            const amt = r.amount ?? 0;
            return (
              <tr key={r.id} className="border-b border-sam-border-soft">
                <td className={COMMUNITY_TD}>
                  <CommunityTimeCell iso={r.createdAt} absolute />
                </td>
                <td className={COMMUNITY_TD}>
                  <TradeMemberCell userId={r.userId} label={r.userNickname} returnTo={q.selfHref} />
                  {r.userId && !userId ? (
                    <AdminActionButton
                      variant="quiet"
                      size="sm"
                      className="!h-auto !px-0 text-left text-[12px] font-normal"
                      onClick={() => q.setExtra("userId", r.userId ?? "")}
                    >
                      {t("admin_trade_this_member_only")}
                    </AdminActionButton>
                  ) : null}
                </td>
                <td className={COMMUNITY_TD}>{pointTypeLabel(t, r.relatedType, r.entryType)}</td>
                <td className={`${COMMUNITY_TD} whitespace-nowrap font-semibold ${amt < 0 ? "text-sam-danger" : "text-sam-success"}`}>
                  {amt > 0 ? "+" : ""}
                  {formatAdminNumber(amt)} P
                </td>
                <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{formatTradePoints(r.balanceAfter)}</td>
                <td className={`${COMMUNITY_TD} max-w-[22rem]`}>
                  {r.description || "—"}
                  <AdminTechDetails ko>
                    <div>ledger: {r.id}</div>
                    <div>
                      related: {r.relatedType ?? "—"} / {r.relatedId ?? "—"} · entry: {r.entryType ?? "—"}
                    </div>
                  </AdminTechDetails>
                </td>
                <td className={COMMUNITY_TD}>{actorLabel(t, r)}</td>
              </tr>
            );
          })}
        </CommunityTable>
      </CommunityListBody>

      {adjustOpen ? (
        <AdjustSheet
          onClose={() => setAdjustOpen(false)}
          onDone={(message) => {
            setAdjustOpen(false);
            setBanner({ ok: true, message });
            reload();
          }}
        />
      ) : null}
    </CommunityListShell>
  );
}

/* ───────── 포인트 지급·회수 시트 ───────── */

type Member = { user_id: string; label: string | null };

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `trade-adjust-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function AdjustSheet({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Member[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [member, setMember] = useState<Member | null>(null);
  const [balance, setBalance] = useState<{ value: number } | { error: true } | null>(null);
  const [op, setOp] = useState<"credit" | "debit">("credit");
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [key, setKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = Math.trunc(Number(amountText) || 0);
  const reasonOk = reason.trim().length >= 2;
  const balanceValue = balance && "value" in balance ? balance.value : null;
  const overDebit = op === "debit" && balanceValue !== null && amount > balanceValue;
  const canNext = Boolean(member) && balanceValue !== null && amount >= 1 && reasonOk && !overDebit && !pending;
  const after = balanceValue === null ? null : balanceValue + (op === "credit" ? amount : -amount);

  const runSearch = async () => {
    const term = search.trim();
    if (!term) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/trade/members?q=${encodeURIComponent(term)}&limit=20`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; rows?: Member[] };
      if (!res.ok || j.ok === false) {
        setResults([]);
        setError(tradeErrorText(j.error || `http_${res.status}`));
      } else setResults(j.rows ?? []);
    } catch {
      setResults([]);
      setError(tradeErrorText("network_error"));
    }
    setSearching(false);
  };

  const pick = async (m: Member) => {
    setMember(m);
    setBalance(null);
    setResults(null);
    try {
      const res = await fetch(`/api/admin/trade/points/adjust?userId=${encodeURIComponent(m.user_id)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; balance?: number };
      if (!res.ok || !j.ok || typeof j.balance !== "number") setBalance({ error: true });
      else setBalance({ value: Math.trunc(j.balance) });
    } catch {
      setBalance({ error: true });
    }
  };

  const goConfirm = () => {
    if (!canNext) return;
    setError(null);
    // 확인 화면을 열 때 1회 생성 — 같은 확인 화면에서의 재시도는 같은 키를 쓴다
    setKey(newIdempotencyKey());
    setStep(2);
  };

  const run = async () => {
    if (!member || !key || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/trade/points/adjust", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, userId: member.user_id, amount, reason: reason.trim(), idempotencyKey: key }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; balanceAfter?: number | null };
      setPending(false);
      if (res.ok && j.ok) {
        const who = member.label || t("admin_trade_points_member");
        const vars = { who, amount: formatAdminNumber(amount) };
        const done = op === "credit" ? t("admin_trade_points_done_credit", vars) : t("admin_trade_points_done_debit", vars);
        onDone(
          typeof j.balanceAfter === "number"
            ? `${done} ${t("admin_trade_points_done_balance", { balance: formatAdminNumber(j.balanceAfter) })}`
            : done
        );
        return;
      }
      setError(adjustErrorText(t, j.error || `http_${res.status}`));
    } catch {
      setPending(false);
      setError(tradeErrorText("network_error"));
    }
  };

  const footer =
    step === 1 ? (
      <div className={OverlayUi.actionsRow}>
        <DibayOverlayButton roleTone="secondary" onClick={onClose}>
          {t("admin_trade_points_wizard_cancel")}
        </DibayOverlayButton>
        <DibayOverlayButton roleTone={op === "debit" ? "destructive" : "primary"} disabled={!canNext} onClick={goConfirm}>
          {t("admin_trade_points_wizard_next")}
        </DibayOverlayButton>
      </div>
    ) : (
      <div className={OverlayUi.actionsRow}>
        <DibayOverlayButton roleTone="secondary" disabled={pending} onClick={() => setStep(1)}>
          {t("admin_trade_points_wizard_prev")}
        </DibayOverlayButton>
        <DibayOverlayButton
          roleTone={op === "debit" ? "destructive" : "primary"}
          disabled={pending}
          loading={pending}
          onClick={() => void run()}
        >
          {pending ? t("admin_trade_flow_processing") : op === "credit" ? t("admin_trade_points_op_credit") : t("admin_trade_points_op_debit")}
        </DibayOverlayButton>
      </div>
    );

  return (
    <AdminFormSheet
      title={step === 2 ? t("admin_trade_points_confirm_title") : t("admin_trade_points_adjust_title")}
      subtitle={step === 2 ? t("admin_trade_points_confirm_sub") : undefined}
      onClose={pending ? () => undefined : onClose}
      dismissible={!pending}
      footer={footer}
    >
      <div className="space-y-3">
        {step === 1 ? (
          <>
            <div>
              <span className="sam-text-helper font-medium text-sam-fg">{t("admin_trade_points_member")}</span>
              {member ? (
                <div className="mt-1 flex items-center justify-between gap-2 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[13px]">
                  <span className="font-medium text-sam-fg">{member.label || t("admin_trade_kit_no_name")}</span>
                  <AdminActionButton
                    variant="quiet"
                    size="sm"
                    onClick={() => {
                      setMember(null);
                      setBalance(null);
                    }}
                  >
                    {t("admin_trade_points_reselect")}
                  </AdminActionButton>
                </div>
              ) : (
                <>
                  <form
                    className="mt-1 flex gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void runSearch();
                    }}
                  >
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t("admin_trade_points_search_nickname")}
                      className={`w-full ${OverlayUi.input}`}
                    />
                    <AdminActionButton type="submit" variant="secondary" disabled={searching || !search.trim()}>
                      {adminCta("search", true)}
                    </AdminActionButton>
                  </form>
                  {results ? (
                    results.length === 0 ? (
                      <p className="mt-2 text-[13px] text-sam-muted">{t("admin_trade_points_no_results")}</p>
                    ) : (
                      <ul className="mt-2 max-h-56 divide-y divide-sam-border-soft overflow-y-auto rounded-ui-rect border border-sam-border bg-sam-surface">
                        {results.map((m) => (
                          <li key={m.user_id}>
                            <AdminActionButton
                              variant="quiet"
                              className="w-full !justify-start rounded-none text-left font-normal text-sam-fg hover:no-underline hover:bg-sam-app"
                              onClick={() => void pick(m)}
                            >
                              {m.label || t("admin_trade_kit_no_name")}
                            </AdminActionButton>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : null}
                </>
              )}
            </div>

            {member ? (
              <p className="text-[13px] text-sam-fg">
                {t("admin_trade_points_current_balance_label")}{" "}
                {balance === null ? (
                  <span className="text-sam-muted">{t("admin_trade_points_checking")}</span>
                ) : "value" in balance ? (
                  <strong>{formatTradePoints(balance.value)}</strong>
                ) : (
                  <span className="text-sam-danger">{t("admin_trade_points_balance_failed")}</span>
                )}
              </p>
            ) : null}

            <fieldset className="flex gap-4 text-[13px]">
              <legend className="sr-only">{t("admin_trade_points_op_legend")}</legend>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="op" checked={op === "credit"} onChange={() => setOp("credit")} />
                {t("admin_trade_points_op_grant")}
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="op" checked={op === "debit"} onChange={() => setOp("debit")} />
                {t("admin_trade_points_op_reclaim")}
              </label>
            </fieldset>

            <label className="block">
              <span className="sam-text-helper font-medium text-sam-fg">{t("admin_trade_points_amount")}</span>
              <input
                inputMode="numeric"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder={t("admin_trade_points_amount_placeholder")}
                className={`mt-1 w-full ${OverlayUi.input}`}
              />
              {overDebit ? (
                <span className="mt-1 block sam-text-xxs text-sam-danger">{t("admin_trade_points_over_balance")}</span>
              ) : null}
            </label>

            <label className="block">
              <span className="sam-text-helper font-medium text-sam-fg">{t("admin_trade_points_reason")}</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={t("admin_trade_points_reason_placeholder")}
                className={`mt-1 w-full ${OverlayUi.input}`}
              />
              <span className={`mt-1 block sam-text-xxs ${reasonOk ? "text-sam-muted" : "text-sam-danger"}`}>
                {t("admin_trade_points_reason_min_length", { n: reason.trim().length })}
              </span>
            </label>
          </>
        ) : (
          <dl className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-app p-3 sam-text-body">
            {[
              [t("admin_trade_points_member"), member?.label || t("admin_trade_kit_no_name")],
              [t("admin_trade_points_op_legend"), op === "credit" ? t("admin_trade_points_op_credit") : t("admin_trade_points_op_debit")],
              [t("admin_trade_th_points"), `${op === "credit" ? "+" : "-"}${formatAdminNumber(amount)} P`],
              [t("admin_trade_points_balance_now"), formatTradePoints(balanceValue)],
              [t("admin_trade_points_balance_after"), formatTradePoints(after)],
              [t("admin_trade_points_reason"), reason.trim()],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[7rem_1fr] gap-2">
                <dt className="text-sam-muted">{k}</dt>
                <dd className="min-w-0 whitespace-pre-wrap text-sam-fg [overflow-wrap:anywhere]">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {error ? (
          <p role="alert" className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 sam-text-helper text-sam-fg">
            {error}
          </p>
        ) : null}
      </div>
    </AdminFormSheet>
  );
}

function adjustErrorText(t: Translate, code: string): string {
  if (code === "user_not_found") return t("admin_trade_points_err_user_not_found");
  if (code === "invalid_input") return t("admin_trade_points_err_invalid_input");
  return tradeErrorText(code);
}
