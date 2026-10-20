"use client";

/**
 * 거래 활동 제한 `/admin/trade/restrictions` (설계 v2 §C-5).
 * 탭: 진행 중 / 만료 / 해제 / 전체 · 필터: 종류(경고·거래 활동 제한) · 닉네임 · 특정 회원(?userId=).
 * 「해제」 2단계 확인 → POST ./restrictions/:id/revoke · 「제한 추가」 → POST ./restrictions.
 * 추가·해제 시트는 판매자·구매자 상세에서도 그대로 쓴다.
 * URL: tab · kind · q · userId · page · size(20/50/100)
 */
import Link from "next/link";
import { useRef, useState } from "react";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunityFilterBar,
  CommunityFilterField,
  CommunityListPagination,
  CommunityListShell,
  CommunitySelect,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  useCommunityQueryState,
  type CommunitySheetSettle,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import {
  COMMUNITY_STALE_TEXT,
  CommunityBannerView,
  communityActionFetch,
  communityWarningsOf,
  type CommunityBanner,
} from "@/components/admin/community/reports/community-report-admin-shared";
import { TradeMemberCell, tradeDetailHref, tradeErrorText } from "@/components/admin/trade/kit/TradeAdminKit";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

const REASON_MIN = 2;

type Rec = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/* ───────── 공용 라벨·부품 (신고·회원 상세에서도 사용) ───────── */

export const TRADE_RESTRICTION_SCOPE_LABEL: Record<string, string> = {
  post: "글 작성·수정",
  chat: "거래 채팅",
  all: "거래 전체",
};

export const TRADE_RESTRICTION_DAY_SELECT: { value: string; label: string }[] = [
  { value: "1", label: "1일" },
  { value: "3", label: "3일" },
  { value: "7", label: "7일" },
  { value: "30", label: "30일" },
  { value: "perm", label: "영구" },
];

const SANCTION_KIND_LABEL: Record<string, string> = {
  warning: "경고",
  trade_restriction: "거래 활동 제한",
  community_restriction: "커뮤니티 활동 제한",
  chat_ban: "채팅 제한",
  temp_suspend: "계정 정지",
  permanent_ban: "계정 차단",
};

export function tradeSanctionKindLabel(kind: string | null | undefined): string {
  return SANCTION_KIND_LABEL[s(kind)] ?? "기타 조치";
}

export function tradeSanctionStatusOf(r: Rec): "active" | "expired" | "revoked" {
  const st = s(r.status);
  if (st === "active" || st === "expired" || st === "revoked") return st;
  if (r.revoked_at) return "revoked";
  if (r.end_at && Date.parse(s(r.end_at)) <= Date.now()) return "expired";
  return "active";
}

export function tradeSanctionPeriodText(r: Rec): string {
  if (s(r.sanction_type) === "warning") return "—";
  const start = r.start_at ? formatAdminManilaDateTime(s(r.start_at)) : "—";
  return r.end_at ? `${start} ~ ${formatAdminManilaDateTime(s(r.end_at))} PHT` : `${start} PHT ~ 영구`;
}

export function TradeSanctionStateBadge({ row }: { row: Rec }) {
  if (s(row.sanction_type) === "warning") return <AdminToneBadge tone="warning">경고</AdminToneBadge>;
  const st = tradeSanctionStatusOf(row);
  if (st === "active") return <AdminToneBadge tone="danger">진행 중</AdminToneBadge>;
  if (st === "revoked") return <AdminToneBadge tone="success">해제</AdminToneBadge>;
  return <AdminToneBadge tone="neutral">만료</AdminToneBadge>;
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

export function tradeSettleBanner(kind: CommunitySheetSettle, okText: string, json: Rec): CommunityBanner {
  if (kind === "stale") return { tone: "warning", text: COMMUNITY_STALE_TEXT };
  if (kind === "gone") return { tone: "error", text: tradeErrorText("not_found") };
  const warn = communityWarningsOf(json);
  if (json.duplicate === true) return { tone: "warning", text: "이미 같은 조치가 적용 중이라 새로 추가하지 않았습니다.", extra: warn };
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
  const lastJson = useRef<Rec>({});
  const r = row as Rec;
  return (
    <CommunityActionSheet
      title={s(r.sanction_type) === "warning" ? "경고 해제" : "거래 활동 제한 해제"}
      rows={[
        { label: "회원", value: s(r.user_label).trim() || "회원" },
        {
          label: "종류·범위",
          value: `${tradeSanctionKindLabel(s(r.sanction_type))}${
            r.restriction ? ` · ${TRADE_RESTRICTION_SCOPE_LABEL[s(r.restriction)] ?? "범위 확인 불가"}` : ""
          }`,
        },
        { label: "기간", value: tradeSanctionPeriodText(r) },
        { label: "제한 사유", value: s(r.reason) || "—" },
      ]}
      notice="해제하면 바로 거래 활동이 가능해지고, 회원에게 알림이 갑니다."
      reason={{ minLength: REASON_MIN, placeholder: "해제 사유 (예: 이의신청 인정)" }}
      confirmLabel="해제"
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
      onSettled={(kind) => onSettled(tradeSettleBanner(kind, "해제했습니다.", lastJson.current))}
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
      const res = await fetch(`/api/admin/trade/members?q=${encodeURIComponent(v)}&limit=10`, {
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
          (j.rows ?? []).filter((r) => r.user_id).map((r) => ({ id: String(r.user_id), label: r.label?.trim() || "이름 없음" }))
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
      title={kind === "warning" ? "경고 보내기" : "거래 활동 제한"}
      rows={[
        { label: "회원", value: member ? member.label : "선택 필요" },
        {
          label: "조치",
          value:
            kind === "warning"
              ? "경고"
              : `${TRADE_RESTRICTION_SCOPE_LABEL[scope]} · ${days === "perm" ? "영구" : `${days}일`}`,
        },
      ]}
      notice={
        kind === "warning"
          ? "경고는 기록과 알림만 남기고 거래 활동을 막지 않습니다."
          : "선택한 범위의 거래 활동만 막습니다. 커뮤니티·배달·메신저는 그대로입니다. 회원에게 알림이 갑니다."
      }
      reason={{ minLength: REASON_MIN, placeholder: "사유 (회원 알림·운영 기록에 남습니다)" }}
      ready={Boolean(member)}
      destructive={kind === "trade_restriction"}
      confirmLabel={kind === "warning" ? "경고 보내기" : "거래 활동 제한"}
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
          tradeSettleBanner(k, kind === "warning" ? "경고를 보냈습니다." : "거래 활동을 제한했습니다. 회원에게 알림이 갑니다.", lastJson.current)
        )
      }
    >
      <div className="space-y-2">
        <span className="text-[12px] font-semibold text-sam-fg">회원</span>
        {member ? (
          <div className="flex items-center justify-between gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px]">
            <span className="font-medium text-sam-fg">{member.label}</span>
            {lockMember ? null : (
              <AdminActionButton variant="quiet" size="sm" onClick={() => setMember(null)}>
                다른 회원 선택
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
                placeholder="닉네임"
                className={`${select} flex-1`}
              />
              <AdminActionButton variant="secondary" disabled={searching || !search.trim()} onClick={() => void runSearch()}>
                {searching ? "찾는 중" : "찾기"}
              </AdminActionButton>
            </div>
            {results ? (
              results.length === 0 ? (
                <p className="text-[12px] text-sam-muted">찾는 회원이 없습니다. 거래글을 올렸거나 거래 채팅을 한 회원만 검색됩니다.</p>
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
        <legend className="text-[12px] font-semibold text-sam-fg">종류</legend>
        <label className="mr-4 inline-flex items-center gap-1.5 text-[13px]">
          <input type="radio" checked={kind === "trade_restriction"} onChange={() => setKind("trade_restriction")} />
          거래 활동 제한
        </label>
        <label className="inline-flex items-center gap-1.5 text-[13px]">
          <input type="radio" checked={kind === "warning"} onChange={() => setKind("warning")} />
          경고
        </label>
      </fieldset>
      {kind === "trade_restriction" ? (
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-sam-muted">
            범위
            <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className={select}>
              {(["post", "chat", "all"] as const).map((v) => (
                <option key={v} value={v}>
                  {TRADE_RESTRICTION_SCOPE_LABEL[v]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-sam-muted">
            기간
            <select value={days} onChange={(e) => setDays(e.target.value)} className={select}>
              {TRADE_RESTRICTION_DAY_SELECT.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
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
const TABS: { value: TabKey; label: string }[] = [
  { value: "active", label: "진행 중" },
  { value: "expired", label: "만료" },
  { value: "revoked", label: "해제" },
  { value: "all", label: "전체" },
];
const EMPTY_TEXT: Record<TabKey, string> = {
  active: "현재 진행 중인 경고·거래 활동 제한이 없습니다.",
  expired: "기간이 끝난 제한이 없습니다.",
  revoked: "해제된 기록이 없습니다.",
  all: "경고·거래 활동 제한 기록이 없습니다.",
};
const KIND_OPTIONS = [
  { value: "", label: "전체 종류" },
  { value: "warning", label: "경고" },
  { value: "trade_restriction", label: "거래 활동 제한" },
];

type ListResponse = { ok?: boolean; error?: string; total?: number; rows?: TradeRestrictionRow[] };

export function TradeRestrictionsPage() {
  const qs = useCommunityQueryState();
  const tabRaw = qs.get("tab");
  const tab: TabKey = (TABS.find((t) => t.value === tabRaw)?.value ?? "active") as TabKey;
  const kind = qs.get("kind");
  const q = qs.get("q");
  const userId = qs.get("userId");
  const [banner, setBanner] = useState<CommunityBanner>(null);
  const [revokeRow, setRevokeRow] = useState<TradeRestrictionRow | null>(null);
  const [adding, setAdding] = useState(false);

  const buildUrl = (status: TabKey, limit: number, offset: number) => {
    const p = new URLSearchParams({ status, limit: String(limit), offset: String(offset) });
    if (kind) p.set("kind", kind);
    if (q) p.set("q", q);
    if (userId) p.set("userId", userId);
    return `/api/admin/trade/restrictions?${p.toString()}`;
  };

  const { state, reload } = useCommunityAdminJson<ListResponse>(buildUrl(tab, qs.limitOffset.limit, qs.limitOffset.offset));
  // 탭 건수 — 총 건수만 (1행 조회)
  const cActive = useCommunityAdminJson<ListResponse>(buildUrl("active", 1, 0));
  const cExpired = useCommunityAdminJson<ListResponse>(buildUrl("expired", 1, 0));
  const cRevoked = useCommunityAdminJson<ListResponse>(buildUrl("revoked", 1, 0));
  const cAll = useCommunityAdminJson<ListResponse>(buildUrl("all", 1, 0));
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
    ? { id: userId, label: rows.find((r) => r.user_id === userId)?.user_label?.trim() || "선택한 회원" }
    : null;

  return (
    <CommunityListShell
      title="거래 활동 제한"
      description="거래 경고·활동 제한을 확인하고 해제하거나 새로 적용합니다. 계정 정지는 판매자·구매자 상세에서 합니다."
      actions={
        <>
          <AdminActionButton variant="secondary" onClick={reloadAll}>
            새로고침
          </AdminActionButton>
          <AdminActionButton variant="secondary" onClick={() => setAdding(true)}>
            제한 추가
          </AdminActionButton>
        </>
      }
      banner={<CommunityBannerView banner={banner} onClose={() => setBanner(null)} />}
      tabs={
        <CommunityTabs
          value={tab}
          onChange={(v) => qs.set({ tab: v === "active" ? null : v })}
          tabs={TABS.map((t) => ({ value: t.value, label: t.label, count: counts[t.value] }))}
        />
      }
      filterBar={
        <CommunityFilterBar searchPlaceholder="닉네임" resetKeep={["tab"]} onRefresh={reloadAll} pending={state.status === "loading"}>
          <CommunityFilterField label="종류">
            <CommunitySelect value={kind} onChange={(v) => qs.set({ kind: v })} options={KIND_OPTIONS} />
          </CommunityFilterField>
          {userId ? (
            <span className="inline-flex items-center gap-1 self-end rounded-full border border-sam-border bg-sam-app px-2 py-1 text-[12px] text-sam-fg">
              특정 회원만 보기
              <AdminActionButton
                variant="quiet"
                size="sm"
                className="!h-6 !px-1"
                aria-label="특정 회원 해제"
                onClick={() => qs.set({ userId: null })}
              >
                ×
              </AdminActionButton>
            </span>
          ) : null}
        </CommunityFilterBar>
      }
      footer={<CommunityListPagination q={qs} total={total} disabled={state.status === "loading"} />}
    >
      {state.status === "loading" && !state.data ? (
        <AdminLoadingState ko />
      ) : state.status === "error" ? (
        <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
      ) : rows.length === 0 ? (
        <AdminEmptyState
          ko
          message={EMPTY_TEXT[tab]}
          onReset={qs.hasAny(["kind", "q", "userId"]) ? () => qs.reset(["tab"]) : undefined}
        />
      ) : (
        <CommunityTable head={["회원", "종류", "범위", "기간", "사유", "처리자", "출처 신고", "상태", "처리"]}>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-sam-border-soft">
              <td className={COMMUNITY_TD}>
                <TradeMemberCell userId={r.user_id} label={r.user_label} returnTo={qs.selfHref} />
              </td>
              <td className={COMMUNITY_TD}>{tradeSanctionKindLabel(r.sanction_type)}</td>
              <td className={COMMUNITY_TD}>
                {r.sanction_type === "warning" ? (
                  <span className="text-sam-muted">—</span>
                ) : (
                  TRADE_RESTRICTION_SCOPE_LABEL[s(r.restriction)] ?? "범위 확인 불가"
                )}
              </td>
              <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{tradeSanctionPeriodText(r)}</td>
              <td className={COMMUNITY_TD}>
                <p className="line-clamp-3 max-w-[16rem] whitespace-pre-wrap">{r.reason || "—"}</p>
                {r.revoked_at ? (
                  <p className="mt-1 max-w-[16rem] sam-text-xxs text-sam-muted">
                    해제: {r.revoke_reason || "—"} ({r.revoked_by_label ?? "관리자"} ·{" "}
                    {`${formatAdminManilaDateTime(r.revoked_at)} PHT`})
                  </p>
                ) : null}
              </td>
              <td className={COMMUNITY_TD}>
                <span className="flex flex-col">
                  <span>{r.created_by_label ?? "관리자"}</span>
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
                      qs.selfHref
                    )}
                    className="text-sam-primary hover:underline"
                  >
                    신고 보기
                  </Link>
                ) : (
                  <span className="text-sam-muted">직접 적용</span>
                )}
              </td>
              <td className={COMMUNITY_TD}>
                <TradeSanctionStateBadge row={r} />
              </td>
              <td className={COMMUNITY_TD}>
                {r.status === "active" ? (
                  <AdminActionButton variant="ghost" size="sm" onClick={() => setRevokeRow(r)}>
                    해제
                  </AdminActionButton>
                ) : null}
                <AdminTechDetails ko>
                  <div>제한 ID: {r.id}</div>
                  <div>회원 ID: {r.user_id}</div>
                </AdminTechDetails>
              </td>
            </tr>
          ))}
        </CommunityTable>
      )}

      {revokeRow ? (
        <TradeRevokeRestrictionSheet row={revokeRow} onClose={() => setRevokeRow(null)} onSettled={afterSheet} />
      ) : null}
      {adding ? (
        <TradeAddRestrictionSheet initialMember={initialMember} onClose={() => setAdding(false)} onSettled={afterSheet} />
      ) : null}
    </CommunityListShell>
  );
}
