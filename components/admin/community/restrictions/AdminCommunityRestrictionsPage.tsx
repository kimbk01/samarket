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
import { useAdminMe } from "@/hooks/useAdminMe";
import { communityAreaAllowed } from "@/lib/admin/community-admin/community-admin-permissions";
import { COMMUNITY_ADMIN_REASON_MIN_LENGTH } from "@/lib/admin/community-admin/community-admin-reason";
import { COMMUNITY_RESTRICTION_DAY_OPTIONS } from "@/lib/admin/community-admin/community-sanction-input";
import { adminCommunityLabel } from "@/lib/admin/status-labels/community-status-labels";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunityAuthorCell,
  CommunityFilterField,
  CommunityListShell,
  CommunityPagination,
  CommunityResetFilters,
  CommunitySearchInput,
  CommunityStatusBadge,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  communityDetailHref,
  useCommunityQueryState,
  type CommunitySheetSettle,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState, AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import {
  COMMUNITY_STALE_TEXT,
  CommunityBannerView,
  communityActionFetch,
  communityAdminErrorText,
  communityWarningsOf,
  type CommunityBanner,
} from "@/components/admin/community/reports/community-report-admin-shared";

const PAGE_SIZE = 50;

type TabKey = "active" | "expired" | "revoked" | "warnings" | "all";

const TABS: { key: TabKey; label: string; status: string; kind: string }[] = [
  { key: "active", label: "제한 중", status: "active", kind: "community_restriction" },
  { key: "expired", label: "기간 만료", status: "expired", kind: "community_restriction" },
  { key: "revoked", label: "해제됨", status: "revoked", kind: "community_restriction" },
  { key: "warnings", label: "경고 기록", status: "all", kind: "warning" },
  { key: "all", label: "전체", status: "all", kind: "" },
];

const EMPTY_TEXT: Record<TabKey, string> = {
  active: "현재 활동 제한 중인 회원이 없습니다.",
  expired: "기간이 끝난 제한이 없습니다.",
  revoked: "해제된 제한이 없습니다.",
  warnings: "경고 기록이 없습니다.",
  all: "경고·활동 제한 기록이 없습니다.",
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

function periodText(r: RestrictionRow): string {
  if (r.kind === "warning") return "—";
  const start = r.start_at ? formatAdminManilaDateTime(r.start_at) : "—";
  return r.end_at ? `${start} ~ ${formatAdminManilaDateTime(r.end_at)} PHT` : `${start} PHT ~ 영구`;
}

export function AdminCommunityRestrictionsPage() {
  const { language } = useI18n();
  const ko = language !== "en";
  const qs = useCommunityQueryState();
  const { permissions, isSuperAdmin, loading: meLoading } = useAdminMe();
  const canModerate = meLoading || communityAreaAllowed(permissions, "moderation", isSuperAdmin);

  const tab = resolveTab(qs.get("tab"));
  const tabDef = TABS.find((t) => t.key === tab) ?? TABS[0];
  const q = qs.get("q");
  const userId = qs.get("userId");
  const sanctionId = qs.get("sanctionId");
  const page = qs.page;

  const [rows, setRows] = useState<RestrictionRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Partial<Record<TabKey, number>>>({});
  const [loadErr, setLoadErr] = useState<{ code: string; status: number } | null>(null);
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
    setLoadErr(null);
    try {
      const res = await fetch(buildQuery(tabDef, PAGE_SIZE, (page - 1) * PAGE_SIZE), {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; rows?: RestrictionRow[]; total?: number; error?: string };
      if (!res.ok || !j.ok) {
        setLoadErr({ code: j.error ?? `http_${res.status}`, status: res.status });
        setRows(null);
        return;
      }
      setRows(j.rows ?? []);
      setTotal(Number(j.total ?? 0));
    } catch {
      setLoadErr({ code: "network_error", status: 0 });
      setRows(null);
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
  }, [buildQuery, page, tabDef]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  const onSettled = async (kind: CommunitySheetSettle, okText: (json: Record<string, unknown>) => CommunityBanner) => {
    setRevokeRow(null);
    setAdding(false);
    await load();
    if (kind === "stale") setBanner({ tone: "warning", text: COMMUNITY_STALE_TEXT });
    else if (kind === "gone") setBanner({ tone: "error", text: communityAdminErrorText("not_found", ko) });
    else setBanner(okText(lastJson.current));
  };

  return (
    <CommunityListShell
      title="활동 제한 회원"
      description="커뮤니티 경고·활동 제한을 확인하고 해제하거나 새로 적용합니다. 계정 정지는 회원 관리에서 합니다."
      actions={
        <>
          <AdminActionButton variant="secondary" onClick={() => void load()}>
            새로고침
          </AdminActionButton>
          <AdminActionButton
            variant="primary"
            disabled={!canModerate}
            title={canModerate ? undefined : "권한 필요: 신고 처리"}
            onClick={() => setAdding(true)}
          >
            활동 제한 추가
          </AdminActionButton>
        </>
      }
      banner={<CommunityBannerView banner={banner} onClose={() => setBanner(null)} />}
      tabs={
        <CommunityTabs
          value={tab}
          onChange={(v) => qs.set({ tab: v === "active" ? null : v, sanctionId: null })}
          tabs={TABS.map((t) => ({ value: t.key, label: t.label, count: counts[t.key] ?? null }))}
        />
      }
      filters={
        <>
          <CommunityFilterField label="회원 검색">
            <CommunitySearchInput value={q} onCommit={(v) => qs.set({ q: v })} placeholder="닉네임" />
          </CommunityFilterField>
          {userId ? (
            <span className="inline-flex items-center gap-1 self-end rounded-full border border-sam-border bg-sam-app px-2 py-1 text-[12px] text-sam-fg">
              특정 회원만 보기
              <button type="button" aria-label="특정 회원 해제" onClick={() => qs.set({ userId: null })} className="font-semibold text-sam-muted">
                ×
              </button>
            </span>
          ) : null}
          <CommunityResetFilters onReset={() => qs.reset(["tab"])} />
        </>
      }
      footer={
        rows && total > 0 ? (
          <CommunityPagination page={page} pageSize={PAGE_SIZE} total={total} onPage={(p) => qs.set({ page: p > 1 ? p : null })} />
        ) : null
      }
    >
      {loadErr ? (
        <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.status} onRetry={() => void load()} />
      ) : !rows ? (
        <AdminLoadingState ko={ko} />
      ) : rows.length === 0 ? (
        <AdminEmptyState ko={ko} message={EMPTY_TEXT[tab]} />
      ) : (
        <CommunityTable head={["회원", "종류·범위", "기간", "사유", "처리자", "원인 신고", "상태", "처리"]}>
          {rows.map((r) => (
            <tr
              key={r.id}
              data-sanction-row={r.id}
              className={`border-b border-sam-border-soft ${sanctionId === r.id ? "bg-amber-50" : ""}`}
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
              <td className={`${COMMUNITY_TD} whitespace-nowrap`}>{periodText(r)}</td>
              <td className={COMMUNITY_TD}>
                <p className="line-clamp-3 max-w-[16rem] whitespace-pre-wrap">{r.reason || "—"}</p>
                {r.revoked_at ? (
                  <p className="mt-1 max-w-[16rem] sam-text-xxs text-sam-muted">
                    해제: {r.revoke_reason || "—"} ({r.revoked_by_label ?? "관리자"} · {PHT(r.revoked_at)})
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
                {r.source_report_href ? (
                  <Link href={communityDetailHref(r.source_report_href, qs.selfHref)} className="text-sky-800 hover:underline">
                    {r.source_report_kind === "meeting_report" ? "모임 신고 보기" : "신고 보기"}
                  </Link>
                ) : (
                  <span className="text-sam-muted">직접 적용</span>
                )}
              </td>
              <td className={COMMUNITY_TD}>
                {r.kind === "warning" ? (
                  <AdminToneBadge tone="warning">경고</AdminToneBadge>
                ) : (
                  <CommunityStatusBadge domain="restriction_state" value={r.status} ko={ko} />
                )}
              </td>
              <td className={COMMUNITY_TD}>
                {r.kind === "community_restriction" && r.status === "active" ? (
                  <AdminActionButton
                    variant="secondary"
                    className="min-h-8 px-2 py-1 text-[12px]"
                    disabled={!canModerate}
                    title={canModerate ? undefined : "권한 필요: 신고 처리"}
                    onClick={() => setRevokeRow(r)}
                  >
                    제한 해제
                  </AdminActionButton>
                ) : null}
                <AdminTechDetails ko={ko}>
                  <div>제한 ID: {r.id}</div>
                  <div>회원 ID: {r.user_id}</div>
                </AdminTechDetails>
              </td>
            </tr>
          ))}
        </CommunityTable>
      )}

      {revokeRow ? (
        <CommunityActionSheet
          title="제한 해제"
          rows={[
            { label: "회원", value: revokeRow.user_nickname?.trim() || revokeRow.user_label },
            { label: "범위", value: adminCommunityLabel("restriction_scope", revokeRow.restriction, ko).label },
            { label: "기간", value: periodText(revokeRow) },
            { label: "제한 사유", value: revokeRow.reason || "—" },
          ]}
          notice="해제하면 바로 커뮤니티 활동이 가능해지고, 회원에게 알림이 갑니다."
          reason={{ minLength: COMMUNITY_ADMIN_REASON_MIN_LENGTH, placeholder: "해제 사유 (예: 이의신청 인정)" }}
          confirmLabel="제한 해제"
          onClose={() => setRevokeRow(null)}
          onSubmit={async (reason) => {
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
              const warn = communityWarningsOf(json);
              return { tone: warn.length ? "warning" : "success", text: "제한을 해제했습니다.", extra: warn };
            })
          }
        />
      ) : null}

      {adding ? (
        <AddRestrictionSheet
          initialUserId={userId}
          lastJson={lastJson}
          onClose={() => setAdding(false)}
          onSettled={(kind) =>
            void onSettled(kind, (json) => {
              const warn = communityWarningsOf(json);
              if (json.duplicate) return { tone: "warning", text: "이미 같은 조치가 적용 중이라 새로 추가하지 않았습니다.", extra: warn };
              return { tone: warn.length ? "warning" : "success", text: "적용했습니다. 회원에게 알림이 갑니다.", extra: warn };
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
  lastJson,
  onClose,
  onSettled,
}: {
  initialUserId: string;
  lastJson: { current: Record<string, unknown> };
  onClose: () => void;
  onSettled: (kind: CommunitySheetSettle) => void;
}) {
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
      title={kind === "warning" ? "경고 보내기" : "활동 제한"}
      rows={[
        { label: "회원", value: member ? member.nickname?.trim() || "이름 없음" : "선택 필요" },
        {
          label: "조치",
          value:
            kind === "warning"
              ? "경고"
              : `${adminCommunityLabel("restriction_scope", scope, true).label} · ${days === "perm" ? "영구" : `${days}일`}`,
        },
      ]}
      notice={
        kind === "warning"
          ? "경고는 기록과 알림만 남기고 활동을 막지 않습니다."
          : "활동 제한은 커뮤니티 글·댓글·신고·모임만 막습니다. 거래·배달·메신저는 그대로입니다. 회원에게 알림이 갑니다."
      }
      reason={{ minLength: COMMUNITY_ADMIN_REASON_MIN_LENGTH, placeholder: "사유 (회원 알림·운영 기록에 남습니다)" }}
      ready={Boolean(member)}
      destructive={kind === "community_restriction"}
      confirmLabel={kind === "warning" ? "경고 보내기" : "활동 제한"}
      onClose={onClose}
      onSubmit={async (reason) => {
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
        <span className="text-[12px] font-semibold text-sam-fg">회원</span>
        {member ? (
          <div className="flex items-center justify-between gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px]">
            <CommunityAuthorCell userId={member.id} nickname={member.nickname} handle={member.handle} />
            <button type="button" className="text-[12px] text-sam-muted underline" onClick={() => setMember(null)}>
              다른 회원 선택
            </button>
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
                placeholder="닉네임 또는 DIBAY ID"
                className={`${select} flex-1`}
              />
              <AdminActionButton variant="secondary" disabled={searching || !search.trim()} onClick={() => void runSearch()}>
                {searching ? "찾는 중" : "찾기"}
              </AdminActionButton>
            </div>
            {results ? (
              results.length === 0 ? (
                <p className="text-[12px] text-sam-muted">
                  찾는 회원이 없습니다. 커뮤니티에 글·댓글을 쓴 회원만 검색됩니다 — 그 밖의 회원은 회원 화면에서 진입하세요.
                </p>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {results.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => setMember(m)}
                        className="w-full rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-1.5 text-left text-[13px] hover:bg-sam-app"
                      >
                        {m.nickname?.trim() || "이름 없음"}
                        {m.handle ? <span className="ml-2 sam-text-xxs text-sam-muted">@{m.handle}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </>
        )}
        {memberErr ? <p className="text-[12px] text-red-800">{memberErr}</p> : null}
      </div>
      <fieldset className="space-y-1">
        <legend className="text-[12px] font-semibold text-sam-fg">종류</legend>
        <label className="mr-4 inline-flex items-center gap-1.5 text-[13px]">
          <input type="radio" checked={kind === "community_restriction"} onChange={() => setKind("community_restriction")} />
          활동 제한
        </label>
        <label className="inline-flex items-center gap-1.5 text-[13px]">
          <input type="radio" checked={kind === "warning"} onChange={() => setKind("warning")} />
          경고
        </label>
      </fieldset>
      {kind === "community_restriction" ? (
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-sam-muted">
            범위
            <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className={select}>
              <option value="post">글쓰기</option>
              <option value="comment">댓글</option>
              <option value="all">커뮤니티 전체</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-sam-muted">
            기간
            <select value={days} onChange={(e) => setDays(e.target.value)} className={select}>
              {COMMUNITY_RESTRICTION_DAY_OPTIONS.map((d) => (
                <option key={d} value={String(d)}>
                  {d}일
                </option>
              ))}
              <option value="perm">영구</option>
            </select>
          </label>
        </div>
      ) : null}
    </CommunityActionSheet>
  );
}
