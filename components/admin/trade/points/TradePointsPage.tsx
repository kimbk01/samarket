"use client";

/**
 * 거래 포인트 (설계 v2 §G-2) — 거래 홍보 주문·이전 거래 광고·관리자 지급/회수 내역 + 「포인트 지급·회수」.
 * 지급·회수: 회원 선택 → 현재 잔액 → 지급/회수·금액·사유 → 2단계 확인. 확인 화면을 열 때 멱등 키를 1회 만들고 재시도에 재사용.
 * URL: type · entryType · userId · period/from/to · page
 */
import { useState } from "react";
import {
  COMMUNITY_TD,
  CommunityFilterField,
  CommunityListShell,
  CommunityPagination,
  CommunityPeriodFilter,
  CommunityResetFilters,
  CommunitySelect,
  CommunityTable,
  CommunityTimeCell,
  useCommunityQueryState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { useCommunityAdminJson, type CommunityBannerState } from "@/components/admin/community/members/use-community-admin-data";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { AdminFormSheet } from "@/components/admin/AdminFormSheet";
import { DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { TradeMemberCell, formatTradePoints, tradeErrorText } from "@/components/admin/trade/kit/TradeAdminKit";

const PAGE_SIZE = 50;

const TYPE_OPTIONS = [
  { value: "", label: "전체 유형" },
  { value: "promotion_order", label: "홍보 주문" },
  { value: "trade_post_ad", label: "이전 거래 광고" },
  { value: "admin_manual", label: "관리자 지급·회수" },
];
const TYPE_LABEL: Record<string, string> = {
  promotion_order: "홍보 주문",
  trade_post_ad: "이전 거래 광고",
  admin_manual: "관리자",
};

const ENTRY_OPTIONS = [
  { value: "", label: "전체 종류" },
  { value: "ad_hold", label: "보류" },
  { value: "ad_purchase", label: "차감 확정" },
  { value: "ad_hold_release", label: "보류 해제" },
  { value: "spend", label: "차감" },
  { value: "refund", label: "환급" },
  { value: "admin_credit", label: "지급" },
  { value: "admin_debit", label: "회수" },
];
const ENTRY_LABEL: Record<string, string> = Object.fromEntries(ENTRY_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]));

function pointTypeLabel(relatedType: string | null, entryType: string | null): string {
  const r = TYPE_LABEL[String(relatedType ?? "")] ?? "기타";
  const e = ENTRY_LABEL[String(entryType ?? "")];
  return e ? `${r} ${e}` : r;
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
  promoOrderIdCapped?: boolean;
  rows?: LedgerRow[];
};

function actorLabel(r: LedgerRow): string {
  if (r.actorNickname) return r.actorNickname;
  if (r.actorType === "admin") return "관리자";
  if (r.actorType === "user") return "회원";
  return "시스템";
}

export function TradePointsPage() {
  const q = useCommunityQueryState();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [banner, setBanner] = useState<CommunityBannerState>(null);
  const type = q.get("type");
  const entryType = q.get("entryType");
  const userId = q.get("userId");
  const period = q.get("period") || "30d";

  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (entryType) params.set("entryType", entryType);
  if (userId) params.set("userId", userId);
  params.set("period", period);
  if (period === "custom") {
    if (q.get("from")) params.set("from", q.get("from"));
    if (q.get("to")) params.set("to", q.get("to"));
  }
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String((q.page - 1) * PAGE_SIZE));
  const customIncomplete = period === "custom" && (!q.get("from") || !q.get("to"));
  const { state, reload } = useCommunityAdminJson<PointsResponse>(
    customIncomplete ? null : `/api/admin/trade/points?${params.toString()}`
  );
  const rows = state.status === "ok" ? state.data.rows ?? [] : [];
  const total = state.status === "ok" ? (typeof state.data.total === "number" ? state.data.total : null) : null;
  const sums = state.status === "ok" ? state.data.sums ?? null : null;
  const memberName = userId ? rows.find((r) => r.userId === userId)?.userNickname : null;

  return (
    <CommunityListShell
      title="거래 포인트"
      description="거래 홍보와 관리자 지급·회수로 오간 포인트 내역입니다. 포인트는 전체 서비스 공통입니다."
      actions={
        <AdminActionButton variant="primary" onClick={() => setAdjustOpen(true)}>
          포인트 지급·회수
        </AdminActionButton>
      }
      banner={
        <div className="space-y-1">
          <AdminResultBanner ko result={banner} onClose={() => setBanner(null)} />
          {state.status === "ok" ? (
            <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px] text-sam-fg">
              {sums
                ? `조건 합계: ${formatAdminNumber(sums.count)}건 · 들어온 포인트 +${formatAdminNumber(sums.amountIn)} P · 나간 포인트 -${formatAdminNumber(
                    Math.abs(sums.amountOut)
                  )} P`
                : "조건 합계: 확인 불가"}
            </p>
          ) : null}
          {state.status === "ok" && state.data.promoOrderIdCapped ? (
            <p className="text-[12px] text-sam-warning">오래된 홍보 주문 일부는 이 목록에 포함되지 않을 수 있습니다.</p>
          ) : null}
        </div>
      }
      filters={
        <>
          <CommunityFilterField label="유형">
            <CommunitySelect value={type} onChange={(v) => q.set({ type: v })} options={TYPE_OPTIONS} />
          </CommunityFilterField>
          <CommunityFilterField label="종류">
            <CommunitySelect value={entryType} onChange={(v) => q.set({ entryType: v })} options={ENTRY_OPTIONS} />
          </CommunityFilterField>
          <CommunityPeriodFilter
            period={period === "all" ? "" : period}
            from={q.get("from")}
            to={q.get("to")}
            onChange={(v) => q.set({ period: v.period === "30d" ? null : v.period || "all", from: v.from, to: v.to })}
          />
          {userId ? (
            <CommunityFilterField label="회원">
              <span className="flex items-center gap-2 text-[13px] text-sam-fg">
                {memberName || "선택한 회원"}
                <AdminActionButton variant="quiet" size="sm" onClick={() => q.set({ userId: null })}>
                  해제
                </AdminActionButton>
              </span>
            </CommunityFilterField>
          ) : null}
          <CommunityResetFilters onReset={() => q.reset()} />
        </>
      }
      footer={
        total !== null && total > 0 ? (
          <CommunityPagination page={q.page} pageSize={PAGE_SIZE} total={total} onPage={(p) => q.set({ page: p })} />
        ) : null
      }
    >
      {customIncomplete ? (
        <AdminEmptyState ko message="직접 지정 기간의 시작일과 종료일을 모두 선택하세요." />
      ) : state.status === "loading" && !state.data ? (
        <AdminLoadingState ko />
      ) : state.status === "error" ? (
        <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
      ) : rows.length === 0 ? (
        <AdminEmptyState ko message="조건에 맞는 포인트 내역이 없습니다." />
      ) : (
        <CommunityTable head={["시각", "회원", "유형", "포인트", "잔액", "내용", "처리자"]}>
          {rows.map((r) => {
            const amt = r.amount ?? 0;
            return (
              <tr key={r.id} className="border-b border-sam-border-soft">
                <td className={COMMUNITY_TD}>
                  <CommunityTimeCell iso={r.createdAt} />
                </td>
                <td className={COMMUNITY_TD}>
                  <TradeMemberCell userId={r.userId} label={r.userNickname} returnTo={q.selfHref} />
                  {r.userId && !userId ? (
                    <AdminActionButton
                      variant="quiet"
                      size="sm"
                      className="!h-auto !px-0 text-left text-[12px] font-normal"
                      onClick={() => q.set({ userId: r.userId })}
                    >
                      이 회원만 보기
                    </AdminActionButton>
                  ) : null}
                </td>
                <td className={COMMUNITY_TD}>{pointTypeLabel(r.relatedType, r.entryType)}</td>
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
                <td className={COMMUNITY_TD}>{actorLabel(r)}</td>
              </tr>
            );
          })}
        </CommunityTable>
      )}

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
        const who = member.label || "회원";
        onDone(
          `${who}님에게 ${formatAdminNumber(amount)} P 를 ${op === "credit" ? "지급" : "회수"}했습니다.${
            typeof j.balanceAfter === "number" ? ` 현재 잔액 ${formatAdminNumber(j.balanceAfter)} P` : ""
          }`
        );
        return;
      }
      setError(adjustErrorText(j.error || `http_${res.status}`));
    } catch {
      setPending(false);
      setError(tradeErrorText("network_error"));
    }
  };

  const footer =
    step === 1 ? (
      <div className={OverlayUi.actionsRow}>
        <DibayOverlayButton roleTone="secondary" onClick={onClose}>
          취소
        </DibayOverlayButton>
        <DibayOverlayButton roleTone={op === "debit" ? "destructive" : "primary"} disabled={!canNext} onClick={goConfirm}>
          다음
        </DibayOverlayButton>
      </div>
    ) : (
      <div className={OverlayUi.actionsRow}>
        <DibayOverlayButton roleTone="secondary" disabled={pending} onClick={() => setStep(1)}>
          이전
        </DibayOverlayButton>
        <DibayOverlayButton
          roleTone={op === "debit" ? "destructive" : "primary"}
          disabled={pending}
          loading={pending}
          onClick={() => void run()}
        >
          {pending ? "처리 중…" : op === "credit" ? "지급" : "회수"}
        </DibayOverlayButton>
      </div>
    );

  return (
    <AdminFormSheet
      title={step === 2 ? "내용을 확인하세요" : "포인트 지급·회수"}
      subtitle={step === 2 ? "실행하면 회원 포인트에 바로 반영됩니다." : undefined}
      onClose={pending ? () => undefined : onClose}
      dismissible={!pending}
      footer={footer}
    >
      <div className="space-y-3">
        {step === 1 ? (
          <>
            <div>
              <span className="sam-text-helper font-medium text-sam-fg">회원</span>
              {member ? (
                <div className="mt-1 flex items-center justify-between gap-2 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[13px]">
                  <span className="font-medium text-sam-fg">{member.label || "이름 없음"}</span>
                  <AdminActionButton
                    variant="quiet"
                    size="sm"
                    onClick={() => {
                      setMember(null);
                      setBalance(null);
                    }}
                  >
                    다시 선택
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
                      placeholder="닉네임으로 검색"
                      className={`w-full ${OverlayUi.input}`}
                    />
                    <AdminActionButton type="submit" variant="secondary" disabled={searching || !search.trim()}>
                      {adminCta("search", true)}
                    </AdminActionButton>
                  </form>
                  {results ? (
                    results.length === 0 ? (
                      <p className="mt-2 text-[13px] text-sam-muted">검색 결과가 없습니다.</p>
                    ) : (
                      <ul className="mt-2 max-h-56 divide-y divide-sam-border-soft overflow-y-auto rounded-ui-rect border border-sam-border bg-sam-surface">
                        {results.map((m) => (
                          <li key={m.user_id}>
                            <AdminActionButton
                              variant="quiet"
                              className="w-full !justify-start rounded-none text-left font-normal text-sam-fg hover:no-underline hover:bg-sam-app"
                              onClick={() => void pick(m)}
                            >
                              {m.label || "이름 없음"}
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
                현재 잔액:{" "}
                {balance === null ? (
                  <span className="text-sam-muted">확인 중…</span>
                ) : "value" in balance ? (
                  <strong>{formatTradePoints(balance.value)}</strong>
                ) : (
                  <span className="text-sam-danger">확인하지 못했습니다. 다시 선택해 주세요.</span>
                )}
              </p>
            ) : null}

            <fieldset className="flex gap-4 text-[13px]">
              <legend className="sr-only">구분</legend>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="op" checked={op === "credit"} onChange={() => setOp("credit")} />
                지급
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="op" checked={op === "debit"} onChange={() => setOp("debit")} />
                회수
              </label>
            </fieldset>

            <label className="block">
              <span className="sam-text-helper font-medium text-sam-fg">포인트</span>
              <input
                inputMode="numeric"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="예: 1000"
                className={`mt-1 w-full ${OverlayUi.input}`}
              />
              {overDebit ? (
                <span className="mt-1 block sam-text-xxs text-sam-danger">보유 포인트보다 많이 회수할 수 없습니다.</span>
              ) : null}
            </label>

            <label className="block">
              <span className="sam-text-helper font-medium text-sam-fg">사유</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="지급·회수 사유 (회원 포인트 내역에 표시됩니다)"
                className={`mt-1 w-full ${OverlayUi.input}`}
              />
              <span className={`mt-1 block sam-text-xxs ${reasonOk ? "text-sam-muted" : "text-sam-danger"}`}>
                2자 이상 입력 ({reason.trim().length}자)
              </span>
            </label>
          </>
        ) : (
          <dl className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-app p-3 sam-text-body">
            {[
              ["회원", member?.label || "이름 없음"],
              ["구분", op === "credit" ? "지급" : "회수"],
              ["포인트", `${op === "credit" ? "+" : "-"}${formatAdminNumber(amount)} P`],
              ["현재 잔액", formatTradePoints(balanceValue)],
              ["처리 후 잔액", formatTradePoints(after)],
              ["사유", reason.trim()],
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

function adjustErrorText(code: string): string {
  if (code === "user_not_found") return "회원을 찾을 수 없습니다.";
  if (code === "invalid_input") return "회원·포인트·사유를 다시 확인해 주세요.";
  return tradeErrorText(code);
}
