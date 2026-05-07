"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ADMIN_STORE_APPROVAL_LABEL, type AdminStoreReviewRow } from "@/components/admin/stores/admin-store-review-model";
import { splitStoreDescriptionAndKakao } from "@/lib/stores/split-store-description-kakao";
import { AdminStoreReviewSheet } from "@/components/admin/stores/AdminStoreReviewSheet";
import { getSupabaseClient } from "@/lib/supabase/client";
import { runSingleFlight } from "@/lib/http/run-single-flight";

type SalesPerm = {
  allowed_to_sell?: boolean;
  sales_status?: string;
  approved_at?: string | null;
  rejection_reason?: string | null;
  suspension_reason?: string | null;
} | null;

type AdminStoreRow = AdminStoreReviewRow & { sales_permission: SalesPerm };

const STATUS_FILTER: { value: string; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "pending", label: "신청대기" },
  { value: "under_review", label: "검토중" },
  { value: "revision_requested", label: "보완요청" },
  { value: "approved", label: "승인" },
  { value: "rejected", label: "반려" },
  { value: "suspended", label: "정지" },
];

type AdminStoreCounts = Partial<Record<(typeof STATUS_FILTER)[number]["value"], number>>;

function previewText(text: string | null | undefined, max = 56): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "—";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function AdminStoresPage() {
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState<AdminStoreRow[]>([]);
  const [counts, setCounts] = useState<AdminStoreCounts>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sheetStore, setSheetStore] = useState<AdminStoreRow | null>(null);
  const [searchText, setSearchText] = useState("");
  const [realtimeBadge, setRealtimeBadge] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const rtRefreshTimeoutRef = useRef<number | null>(null);

  const qs = useMemo(
    () => {
      const parts: string[] = [];
      if (filter !== "all") parts.push(`status=${encodeURIComponent(filter)}`);
      const q = searchText.trim();
      if (q) parts.push(`q=${encodeURIComponent(q)}`);
      return parts.length ? `?${parts.join("&")}` : "";
    },
    [filter, searchText]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/stores${qs}`, { credentials: "include" });
      const json = await res.json();
      if (res.status === 403) {
        setError("관리자 권한이 없습니다.");
        setRows([]);
        setCounts({});
        return;
      }
      if (!json?.ok) {
        setError(json?.error ?? "load_failed");
        setRows([]);
        setCounts({});
        setSheetStore(null);
        return;
      }
      const nextRows = (json.stores ?? []) as AdminStoreRow[];
      setRows(nextRows);
      setCounts(typeof json.counts === "object" && json.counts ? (json.counts as AdminStoreCounts) : {});
      setSheetStore((prev) => {
        if (prev && nextRows.some((r) => r.id === prev.id)) {
          return nextRows.find((r) => r.id === prev.id) ?? prev;
        }
        return prev;
      });
    } catch {
      setError("network_error");
      setRows([]);
      setCounts({});
      setSheetStore(null);
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;

    const scheduleRefresh = () => {
      setRealtimeBadge(true);
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
      setToast("새 매장 신청이 도착했습니다.");
      toastTimeoutRef.current = window.setTimeout(() => {
        toastTimeoutRef.current = null;
        setToast(null);
      }, 3500);

      if (rtRefreshTimeoutRef.current) window.clearTimeout(rtRefreshTimeoutRef.current);
      rtRefreshTimeoutRef.current = window.setTimeout(() => {
        rtRefreshTimeoutRef.current = null;
        void runSingleFlight("admin:stores:realtime-refresh", () => load());
      }, 250);
    };

    const channel = sb
      .channel("admin-stores-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "stores" },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
      if (rtRefreshTimeoutRef.current) window.clearTimeout(rtRefreshTimeoutRef.current);
      void sb.removeChannel(channel);
    };
  }, [load]);

  const runAction = async (storeId: string, body: Record<string, unknown>) => {
    setBusyId(storeId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/stores/${storeId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.error ?? `action_failed_${res.status}`);
        return;
      }
      await load();
    } catch {
      setError("network_error");
    } finally {
      setBusyId(null);
    }
  };

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-emerald-50 text-emerald-800 border-emerald-200";
      case "rejected":
        return "bg-red-50 text-red-800 border-red-200";
      case "suspended":
        return "bg-orange-50 text-orange-950 border-orange-200";
      case "revision_requested":
        return "bg-amber-50 text-amber-950 border-amber-200";
      case "under_review":
        return "bg-sky-50 text-sky-900 border-sky-200";
      case "pending":
      default:
        return "bg-sam-app text-sam-muted border-sam-border";
    }
  };

  return (
    <div className="space-y-4">
      {sheetStore ? (
        <AdminStoreReviewSheet
          store={sheetStore}
          onClose={() => setSheetStore(null)}
          onRunAction={(action, payload) => {
            const id = sheetStore.id;
            void runAction(id, {
              action,
              ...(payload?.reason ? { reason: payload.reason } : {}),
              ...(payload?.enabled !== undefined ? { enabled: payload.enabled } : {}),
              ...(payload?.store_name ? { store_name: payload.store_name } : {}),
            });
          }}
          actionBusy={busyId === sheetStore.id}
          onSetOwnerIdentityEditable={(enabled) => {
            const id = sheetStore.id;
            void runAction(id, { action: "set_owner_identity_editable", enabled });
          }}
          identityActionBusy={busyId === sheetStore.id}
        />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <AdminPageHeader title="매장 심사 (커머스)" />
          {toast ? (
            <div className="mt-2 rounded-ui-rect border border-sky-200 bg-sky-50 px-3 py-2 sam-text-body-secondary text-sky-900">
              {toast}
            </div>
          ) : null}
        </div>
        {realtimeBadge ? (
          <button
            type="button"
            onClick={() => {
              setRealtimeBadge(false);
              void load();
            }}
            className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-3 py-2 sam-text-xxs font-bold text-sky-900 animate-pulse"
            title="새 신청이 있습니다. 눌러서 새로고침"
          >
            NEW
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTER.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1.5 sam-text-body-secondary font-medium ${
              filter === f.value
                ? "bg-sam-ink text-white"
                : "border border-sam-border bg-sam-surface text-sam-fg"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <span>{f.label}</span>
              <span
                className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-2 py-0.5 sam-text-xxs font-bold ${
                  filter === f.value ? "bg-white/15 text-white" : "bg-sam-app text-sam-muted"
                }`}
                aria-label={`${f.label} 수량`}
              >
                {Number.isFinite(Number(counts[f.value])) ? Number(counts[f.value]) : 0}
              </span>
            </span>
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-body-secondary text-red-800">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="sam-text-body text-sam-muted">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          매장이 없습니다.
        </div>
      ) : (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface">
          <div className="border-b border-sam-border-soft p-3">
            <label className="sam-text-xxs font-bold uppercase tracking-wide text-sam-muted">검색</label>
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="매장명 / @오너 / 전화 / 카카오 / slug"
              className="mt-2 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary text-sam-fg"
            />
            <p className="mt-2 sam-text-xxs text-sam-muted">{rows.length}건</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full border-collapse text-left sam-text-body-secondary">
              <thead className="border-b border-sam-border bg-sam-app sam-text-helper text-sam-muted">
                <tr>
                  <th className="min-w-[220px] px-3 py-2 font-medium">매장</th>
                  <th className="min-w-[120px] px-3 py-2 font-medium">상태</th>
                  <th className="min-w-[80px] px-3 py-2 font-medium">노출</th>
                  <th className="min-w-[160px] px-3 py-2 font-medium">등록 ID</th>
                  <th className="min-w-[160px] px-3 py-2 font-medium">연락</th>
                  <th className="min-w-[180px] px-3 py-2 font-medium">소개</th>
                  <th className="min-w-[140px] px-3 py-2 font-medium">지역</th>
                  <th className="min-w-[160px] px-3 py-2 font-medium">신청일</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const { intro: introForList, kakao: kakaoForList } = splitStoreDescriptionAndKakao(
                    r.description,
                    r.kakao_id
                  );
                  const ownerHandle = String((r as any).owner_handle ?? "").trim() || r.slug;
                  const phoneLine = (r.phone ?? "").trim();
                  const kakaoLine = (kakaoForList ?? "").trim();
                  const contactLine = [phoneLine, kakaoLine].filter(Boolean).join(" · ") || "—";
                  const regionLine = (() => {
                    const reg = String((r as any).region ?? "").trim();
                    const city = String((r as any).city ?? "").trim();
                    return [reg, city].filter(Boolean).join(" · ") || "—";
                  })();
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-sam-border-soft hover:bg-sam-app cursor-pointer"
                      onClick={() => setSheetStore(r)}
                    >
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium text-sam-fg">{(r.store_name ?? "").trim() || "(매장명 없음)"}</div>
                        <div className="mt-1 font-mono sam-text-xxs text-sam-muted">{r.slug}</div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 sam-text-xxs font-bold ${statusBadgeClass(
                            r.approval_status
                          )}`}
                          title={r.approval_status}
                        >
                          {ADMIN_STORE_APPROVAL_LABEL[r.approval_status] ?? r.approval_status}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 sam-text-xxs font-bold ${
                            r.is_visible
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border-sam-border bg-sam-app text-sam-muted"
                          }`}
                        >
                          {r.is_visible ? "Y" : "N"}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top font-mono sam-text-xxs text-sam-fg break-all">{ownerHandle}</td>
                      <td className="px-3 py-2 align-top sam-text-helper text-sam-fg">{contactLine}</td>
                      <td className="px-3 py-2 align-top sam-text-helper text-sam-muted">{previewText(introForList, 84)}</td>
                      <td className="px-3 py-2 align-top sam-text-helper text-sam-muted">{regionLine}</td>
                      <td className="px-3 py-2 align-top sam-text-helper text-sam-muted">
                        {new Date(r.created_at).toLocaleString("ko-KR")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
