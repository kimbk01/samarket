"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

type Row = {
  id: string;
  policy_name: string;
  store_id: string | null;
  category_id: string | null;
  fee_percent: number;
  fixed_fee: number;
  delivery_fee_mode: string;
  delivery_fee_percent: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  memo?: string | null;
  is_archived?: boolean;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
  created_at?: string;
};

type StoreRow = { id: string; store_name?: string | null; slug?: string | null };
type CategoryRow = { id: string; name: string; slug: string; is_active: boolean };

function fmtMoney(n: number) {
  const v = Math.round(Number(n) || 0);
  return `${v.toLocaleString("en-PH")} PHP`;
}

function fmtPercent(n: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0%";
  return `${v.toFixed(2)}%`;
}

function scopeLabel(r: Row): string {
  if (r.store_id) return "업체";
  if (r.category_id) return "업종";
  return "기본";
}

function feePolicyApiErrorCode(error: unknown, httpStatus: number): string {
  const e = typeof error === "string" && error.trim() ? error.trim() : "";
  if (e) return e;
  if (httpStatus === 403) return "forbidden";
  if (httpStatus === 503) return "supabase_unconfigured";
  return `http_error_${httpStatus}`;
}

function feePolicyErrorToKo(code: string | undefined): string {
  const c = String(code ?? "").trim();
  switch (c) {
    case "policy_archived":
      return "보관된 정책은 이 방식으로 수정할 수 없습니다. 복구하거나 보관 해제 후 다시 시도해 주세요.";
    case "conflict_default_overlap":
      return "기본 정책은 같은 기간에 여러 활성 정책을 둘 수 없습니다. 기존 정책을 조정한 뒤 복구해 주세요.";
    case "conflict_priority_overlap":
      return "같은 적용 대상·기간 안에서 동일 priority의 활성 정책이 이미 있습니다. priority 또는 기간을 바꾼 뒤 복구해 주세요.";
    case "failed_to_archive":
      return "보관 처리에 실패했습니다. 잠시 후 다시 시도하거나 관리자에게 문의해 주세요.";
    case "failed_to_restore":
      return "복구에 실패했습니다. 잠시 후 다시 시도하거나 관리자에게 문의해 주세요.";
    case "not_archived":
      return "보관 상태가 아닌 정책입니다.";
    case "network_error":
      return "네트워크 오류가 발생했습니다. 연결을 확인한 뒤 다시 시도해 주세요.";
    case "table_missing":
      return "store_fee_policies 테이블 마이그레이션을 적용해 주세요.";
    case "forbidden":
      return "관리자 권한이 필요합니다.";
    case "supabase_unconfigured":
      return "저장소 설정이 되어 있지 않습니다.";
    default:
      if (/^http_error_\d+$/.test(c)) return `요청이 거절되었습니다. (${c.replace("http_error_", "HTTP ")})`;
      return c || "요청을 처리하지 못했습니다.";
  }
}

function formatArchivedBy(id: string | null | undefined): string {
  const s = typeof id === "string" ? id.trim() : "";
  return s || "—";
}

function targetScopeDescription(r: Row, stores: StoreRow[], categories: CategoryRow[]): string {
  if (r.store_id) {
    const s = stores.find((x) => x.id === r.store_id);
    const tail = s ? `${String(s.store_name ?? "매장")}${s.slug ? ` /${s.slug}` : ""}` : r.store_id;
    if (r.category_id) {
      const c = categories.find((x) => x.id === r.category_id);
      const ct = c ? `${c.name} (${c.slug})` : r.category_id;
      return `업체: ${tail} · 업종(피벗): ${ct}`;
    }
    return `업체: ${tail}`;
  }
  if (r.category_id) {
    const c = categories.find((x) => x.id === r.category_id);
    return c ? `업종: ${c.name} (${c.slug})` : `업종: ${r.category_id}`;
  }
  return "기본(전역)";
}

function feeSummary(r: Row): string {
  return `${fmtPercent(r.fee_percent)} + ${fmtMoney(r.fixed_fee)}`;
}

function isoToDateInput(iso: string | null | undefined): string {
  const s = typeof iso === "string" ? iso.trim() : "";
  return s ? s.slice(0, 10) : "";
}

function dateInputToIsoRangeStart(d: string): string | null {
  const t = d.trim();
  if (!t) return null;
  const ms = new Date(`${t}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function dateInputToIsoRangeEnd(d: string): string | null {
  const t = d.trim();
  if (!t) return null;
  const ms = new Date(`${t}T23:59:59.999Z`).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function AdminStoreFeePoliciesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);

  const [archiveModalRow, setArchiveModalRow] = useState<Row | null>(null);
  const [archiveReasonDraft, setArchiveReasonDraft] = useState("");
  const [archiveModalError, setArchiveModalError] = useState<string | null>(null);

  const [restoreModalRow, setRestoreModalRow] = useState<Row | null>(null);
  const [restoreModalError, setRestoreModalError] = useState<string | null>(null);

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [refLoading, setRefLoading] = useState(false);

  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [policyType, setPolicyType] = useState<"default" | "category" | "store">("default");
  const [name, setName] = useState("");
  const [feePercent, setFeePercent] = useState("12");
  const [fixedFee, setFixedFee] = useState("0");
  const [deliveryMode, setDeliveryMode] = useState<"none" | "percent">("none");
  const [deliveryPercent, setDeliveryPercent] = useState("0");
  const [priority, setPriority] = useState("100");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [memo, setMemo] = useState("");

  const [storeQuery, setStoreQuery] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("active_only", "0");
      if (includeArchived) qs.set("include_archived", "1");
      const res = await fetch(`/api/admin/store-fee-policies?${qs.toString()}`, { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; policies?: Row[] };
      if (!json.ok) {
        setRows([]);
        setError(feePolicyApiErrorCode(json.error, res.status));
        return;
      }
      setRows(Array.isArray(json.policies) ? json.policies : []);
    } catch {
      setRows([]);
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  const loadRefs = useCallback(async () => {
    setRefLoading(true);
    try {
      const [sRes, tRes] = await Promise.all([
        fetch("/api/admin/stores?status=all", { credentials: "include" }),
        fetch("/api/admin/stores/taxonomy", { credentials: "include" }),
      ]);
      const sJson = (await sRes.json().catch(() => ({}))) as { ok?: boolean; stores?: any[] };
      const tJson = (await tRes.json().catch(() => ({}))) as { ok?: boolean; categories?: any[] };
      setStores(
        Array.isArray(sJson.stores)
          ? sJson.stores.map((r) => ({
              id: String(r.id),
              store_name: (r.store_name ?? null) as any,
              slug: (r.slug ?? null) as any,
            }))
          : []
      );
      setCategories(
        Array.isArray(tJson.categories)
          ? tJson.categories.map((c) => ({
              id: String(c.id),
              name: String(c.name ?? ""),
              slug: String(c.slug ?? ""),
              is_active: Boolean(c.is_active),
            }))
          : []
      );
    } catch {
      // optional
    } finally {
      setRefLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  const effectiveDefaults = useMemo(() => {
    const base = rows.find((r) => r.is_active && !r.is_archived && !r.store_id && !r.category_id);
    return base ?? null;
  }, [rows]);

  const resetFormForCreate = useCallback(() => {
    setMode("create");
    setEditingId(null);
    setPolicyType("default");
    setName("");
    setFeePercent("12");
    setFixedFee("0");
    setDeliveryMode("none");
    setDeliveryPercent("0");
    setPriority("100");
    setStartsAt("");
    setEndsAt("");
    setIsActive(true);
    setMemo("");
    setStoreQuery("");
    setSelectedStoreId("");
    setCategoryQuery("");
    setSelectedCategoryId("");
  }, []);

  const startEdit = useCallback((r: Row) => {
    setMode("edit");
    setEditingId(r.id);
    setPolicyType(r.store_id ? "store" : r.category_id ? "category" : "default");
    setName(r.policy_name ?? "");
    setFeePercent(String(r.fee_percent ?? 0));
    setFixedFee(String(r.fixed_fee ?? 0));
    setDeliveryMode(r.delivery_fee_mode === "percent" ? "percent" : "none");
    setDeliveryPercent(String(r.delivery_fee_percent ?? 0));
    setPriority(String(r.priority ?? 100));
    setStartsAt(isoToDateInput(r.starts_at));
    setEndsAt(isoToDateInput(r.ends_at));
    setIsActive(Boolean(r.is_active));
    setMemo(typeof r.memo === "string" ? r.memo : "");
    setSelectedStoreId(r.store_id ?? "");
    setSelectedCategoryId(r.category_id ?? "");
  }, []);

  const storeOptions = useMemo(() => {
    const q = storeQuery.trim().toLowerCase();
    if (!q) return stores.slice(0, 25);
    return stores
      .filter(
        (s) =>
          String(s.store_name ?? "").toLowerCase().includes(q) ||
          String(s.slug ?? "").toLowerCase().includes(q) ||
          String(s.id).includes(q)
      )
      .slice(0, 25);
  }, [storeQuery, stores]);

  const categoryOptions = useMemo(() => {
    const q = categoryQuery.trim().toLowerCase();
    if (!q) return categories.slice(0, 25);
    return categories
      .filter((c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q) || c.id.includes(q))
      .slice(0, 25);
  }, [categories, categoryQuery]);

  const submit = useCallback(async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setError(null);

    const body: Record<string, unknown> = {
      policy_name: n,
      fee_percent: Number(feePercent),
      fixed_fee: Number(fixedFee),
      delivery_fee_mode: deliveryMode,
      delivery_fee_percent: Number(deliveryPercent),
      is_active: isActive,
      priority: Number(priority),
      starts_at: dateInputToIsoRangeStart(startsAt),
      ends_at: dateInputToIsoRangeEnd(endsAt),
      memo: memo.trim() ? memo.trim() : null,
    };

    if (policyType === "default") {
      body.store_id = null;
      body.category_id = null;
    } else if (policyType === "category") {
      body.store_id = null;
      body.category_id = selectedCategoryId || null;
    } else {
      body.store_id = selectedStoreId || null;
      body.category_id = selectedCategoryId || null;
    }

    try {
      const res =
        mode === "create"
          ? await fetch("/api/admin/store-fee-policies", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            })
          : await fetch(`/api/admin/store-fee-policies/${encodeURIComponent(editingId ?? "")}`, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setError(feePolicyApiErrorCode(json.error, res.status));
        return;
      }
      await load();
      resetFormForCreate();
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }, [
    categoryOptions,
    deliveryMode,
    deliveryPercent,
    editingId,
    endsAt,
    feePercent,
    fixedFee,
    isActive,
    load,
    memo,
    mode,
    name,
    policyType,
    priority,
    resetFormForCreate,
    selectedCategoryId,
    selectedStoreId,
    startsAt,
  ]);

  const deactivate = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/store-fee-policies/${encodeURIComponent(id)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: false }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!json.ok) {
          setError(feePolicyApiErrorCode(json.error, res.status));
          return;
        }
        await load();
      } catch {
        setError("network_error");
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  const anyModalOpen = archiveModalRow !== null || restoreModalRow !== null;

  const closeArchiveModal = useCallback((force?: boolean) => {
    if (!force && busy) return;
    setArchiveModalRow(null);
    setArchiveReasonDraft("");
    setArchiveModalError(null);
  }, [busy]);

  const closeRestoreModal = useCallback((force?: boolean) => {
    if (!force && busy) return;
    setRestoreModalRow(null);
    setRestoreModalError(null);
  }, [busy]);

  const confirmArchive = useCallback(async () => {
    const row = archiveModalRow;
    if (!row) return;
    setBusy(true);
    setArchiveModalError(null);
    setError(null);
    try {
      const reason = archiveReasonDraft.trim();
      const res = await fetch(`/api/admin/store-fee-policies/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive_reason: reason ? reason.slice(0, 2000) : null }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setArchiveModalError(feePolicyErrorToKo(feePolicyApiErrorCode(json.error, res.status)));
        return;
      }
      closeArchiveModal(true);
      await load();
    } catch {
      setArchiveModalError(feePolicyErrorToKo("network_error"));
    } finally {
      setBusy(false);
    }
  }, [archiveModalRow, archiveReasonDraft, closeArchiveModal, load]);

  const confirmRestore = useCallback(async () => {
    const row = restoreModalRow;
    if (!row) return;
    setBusy(true);
    setRestoreModalError(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/store-fee-policies/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_archived: false }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setRestoreModalError(feePolicyErrorToKo(feePolicyApiErrorCode(json.error, res.status)));
        return;
      }
      closeRestoreModal(true);
      await load();
    } catch {
      setRestoreModalError(feePolicyErrorToKo("network_error"));
    } finally {
      setBusy(false);
    }
  }, [closeRestoreModal, load, restoreModalRow]);

  return (
    <div className="space-y-4">
      <AdminPageHeader title="수수료 정책 (필리핀형)" />
      <p className="sam-text-body-secondary text-sam-muted">
        우선순위: <strong className="text-sam-fg">업체(store_id) &gt; 업종(category_id) &gt; 기본</strong>. 실제 적용은
        completed 시점에 원장 스냅샷으로 저장됩니다.
      </p>

      {error ? (
        <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950">
          {feePolicyErrorToKo(error)}
        </p>
      ) : null}

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-sam-fg">{mode === "create" ? "정책 생성" : "정책 수정"}</h2>
        <p className="mt-1 sam-text-helper text-sam-muted">
          기간 겹침 + 동일 priority 충돌은 저장 시 차단됩니다.
          {effectiveDefaults ? (
            <span className="ml-1 text-sam-muted">
              (현재 기본: {effectiveDefaults.policy_name}, {fmtPercent(effectiveDefaults.fee_percent)} +{" "}
              {fmtMoney(effectiveDefaults.fixed_fee)})
            </span>
          ) : null}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            className="rounded border border-sam-border px-2 py-1.5 text-sm"
            value={policyType}
            onChange={(e) => setPolicyType(e.target.value as any)}
          >
            <option value="default">기본</option>
            <option value="category">업종</option>
            <option value="store">업체</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-sam-fg">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            활성
          </label>
          <input
            type="date"
            className="rounded border border-sam-border px-2 py-1.5 text-sm"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
          <input
            type="date"
            className="rounded border border-sam-border px-2 py-1.5 text-sm"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="w-56 rounded border border-sam-border px-2 py-1.5 text-sm"
            placeholder="정책명"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-28 rounded border border-sam-border px-2 py-1.5 text-sm"
            placeholder="수수료%"
            value={feePercent}
            onChange={(e) => setFeePercent(e.target.value)}
            inputMode="decimal"
          />
          <input
            className="w-28 rounded border border-sam-border px-2 py-1.5 text-sm"
            placeholder="고정수수료"
            value={fixedFee}
            onChange={(e) => setFixedFee(e.target.value)}
            inputMode="numeric"
          />
          <select
            className="rounded border border-sam-border px-2 py-1.5 text-sm"
            value={deliveryMode}
            onChange={(e) => setDeliveryMode(e.target.value as any)}
          >
            <option value="none">배달비 수익 없음</option>
            <option value="percent">배달비 수익 %</option>
          </select>
          {deliveryMode === "percent" ? (
            <input
              className="w-28 rounded border border-sam-border px-2 py-1.5 text-sm"
              placeholder="배달비%"
              value={deliveryPercent}
              onChange={(e) => setDeliveryPercent(e.target.value)}
              inputMode="decimal"
            />
          ) : null}
          <input
            className="w-28 rounded border border-sam-border px-2 py-1.5 text-sm"
            placeholder="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            inputMode="numeric"
          />
          <button
            type="button"
            disabled={
              busy ||
              !name.trim() ||
              (policyType === "store" && !selectedStoreId) ||
              (policyType === "category" && !selectedCategoryId)
            }
            onClick={() => void submit()}
            className="rounded bg-sam-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {mode === "create" ? "생성" : "저장"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="rounded border border-sam-border px-3 py-2 text-sm font-medium text-sam-fg disabled:opacity-40"
          >
            새로고침
          </button>
          {mode === "edit" ? (
            <button
              type="button"
              onClick={resetFormForCreate}
              className="rounded border border-sam-border px-3 py-2 text-sm font-medium text-sam-fg"
            >
              새 정책 생성으로 전환
            </button>
          ) : null}
        </div>

        {policyType === "store" ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <p className="sam-text-helper text-sam-muted">업체 선택</p>
              <input
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
                placeholder="매장명/슬러그 검색"
                value={storeQuery}
                onChange={(e) => setStoreQuery(e.target.value)}
              />
              <select
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                disabled={refLoading}
              >
                <option value="">(선택)</option>
                {storeOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {String(s.store_name ?? "매장")} {s.slug ? `/${s.slug}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="sam-text-helper text-sam-muted">업종(선택)</p>
              <input
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
                placeholder="업종 검색"
                value={categoryQuery}
                onChange={(e) => setCategoryQuery(e.target.value)}
              />
              <select
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                disabled={refLoading}
              >
                <option value="">(선택 안함)</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.slug})
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {policyType === "category" ? (
          <div className="mt-3">
            <p className="sam-text-helper text-sam-muted">업종 선택</p>
            <input
              className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
              placeholder="업종 검색"
              value={categoryQuery}
              onChange={(e) => setCategoryQuery(e.target.value)}
            />
            <select
              className="mt-1 w-full rounded border border-sam-border px-2 py-1.5 text-sm"
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              disabled={refLoading}
            >
              <option value="">(선택)</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.slug})
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="mt-3">
          <p className="sam-text-helper text-sam-muted">메모</p>
          <textarea
            className="mt-1 w-full rounded border border-sam-border px-2 py-2 text-sm"
            rows={3}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="계약/운영 메모"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-2">
        <label className="flex items-center gap-2 text-sm text-sam-fg">
          <input
            type="checkbox"
            checked={includeArchived}
            disabled={loading || busy}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          보관 포함
        </label>
        <p className="sam-text-xxs text-sam-muted">
          보관 정책은 정산에 적용되지 않습니다. 기본 목록에서는 숨깁니다.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-sam-muted">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 text-sm text-sam-muted">
          정책이 없습니다. 기본 정책부터 생성해 주세요.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
          <table className="min-w-[960px] w-full text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border-soft bg-sam-app text-sam-muted">
              <tr>
                <th className="px-3 py-2">정책명</th>
                <th className="px-3 py-2">대상</th>
                <th className="px-3 py-2">수수료</th>
                <th className="px-3 py-2">배달비 수익</th>
                <th className="px-3 py-2">기간</th>
                <th className="px-3 py-2">priority</th>
                <th className="px-3 py-2">활성</th>
                <th className="px-3 py-2">보관</th>
                <th className="px-3 py-2">메모</th>
                <th className="px-3 py-2">액션</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b border-sam-border-soft ${r.is_archived ? "bg-slate-50 text-slate-600" : ""}`}
                >
                  <td className={`px-3 py-2 font-medium ${r.is_archived ? "text-slate-700" : "text-sam-fg"}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{r.policy_name}</span>
                      {r.is_archived ? (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 sam-text-xxs font-medium text-slate-700">
                          보관됨
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-sam-muted">{targetScopeDescription(r, stores, categories)}</td>
                  <td className="px-3 py-2">
                    {fmtPercent(r.fee_percent)} + {fmtMoney(r.fixed_fee)}
                  </td>
                  <td className="px-3 py-2 text-sam-muted">
                    {r.delivery_fee_mode === "percent" ? fmtPercent(r.delivery_fee_percent) : "—"}
                  </td>
                  <td className="px-3 py-2 text-sam-muted">
                    {(r.starts_at ?? "").slice(0, 10) || "—"} ~ {(r.ends_at ?? "").slice(0, 10) || "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-sam-muted">{r.priority}</td>
                  <td className="px-3 py-2">{r.is_active ? "ON" : "OFF"}</td>
                  <td className="px-3 py-2 sam-text-xxs text-sam-muted">
                    {r.is_archived ? (
                      <div className="space-y-1.5">
                        <div>
                          <span className="text-slate-500">보관일</span>{" "}
                          <span className="font-mono text-slate-700">
                            {(r.archived_at ?? "").slice(0, 19).replace("T", " ") || "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">보관자</span>{" "}
                          <span className="break-all font-mono text-slate-700">{formatArchivedBy(r.archived_by)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">사유</span>{" "}
                          <span className="break-words text-slate-700">
                            {typeof r.archive_reason === "string" && r.archive_reason.trim()
                              ? r.archive_reason
                              : "—"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 sam-text-xxs text-sam-muted">
                    {typeof r.memo === "string" && r.memo.trim()
                      ? r.memo.length > 60
                        ? `${r.memo.slice(0, 60)}…`
                        : r.memo
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy || anyModalOpen || Boolean(r.is_archived)}
                        className="rounded border border-sam-border px-2 py-1 sam-text-xxs text-sam-fg disabled:opacity-40"
                        onClick={() => startEdit(r)}
                      >
                        수정
                      </button>
                      {r.is_active && !r.is_archived ? (
                        <button
                          type="button"
                          disabled={busy || anyModalOpen}
                          className="rounded border border-amber-300 px-2 py-1 sam-text-xxs text-amber-900 disabled:opacity-40"
                          onClick={() => void deactivate(r.id)}
                        >
                          비활성
                        </button>
                      ) : null}
                      {!r.is_archived ? (
                        <button
                          type="button"
                          disabled={busy || anyModalOpen}
                          className="rounded border border-slate-400 px-2 py-1 sam-text-xxs text-slate-800 disabled:opacity-40"
                          onClick={() => {
                            setArchiveModalRow(r);
                            setArchiveReasonDraft("");
                            setArchiveModalError(null);
                          }}
                        >
                          보관
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy || anyModalOpen}
                          className="rounded border border-emerald-400 px-2 py-1 sam-text-xxs text-emerald-900 disabled:opacity-40"
                          onClick={() => {
                            setRestoreModalRow(r);
                            setRestoreModalError(null);
                          }}
                        >
                          복구
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {archiveModalRow ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) closeArchiveModal();
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fee-policy-archive-title"
          >
            <h2 id="fee-policy-archive-title" className="text-base font-bold text-sam-fg">
              정책 보관
            </h2>
            <p className="mt-2 sam-text-helper text-sam-muted">
              삭제가 아니라 보관입니다. 보관된 정책은 정산 계산 후보에서 제외되며, 필요 시 복구할 수 있습니다.
            </p>
            <dl className="mt-4 space-y-2 sam-text-body-secondary">
              <div>
                <dt className="text-sam-muted">정책명</dt>
                <dd className="font-medium text-sam-fg">{archiveModalRow.policy_name}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">적용 대상</dt>
                <dd>{targetScopeDescription(archiveModalRow, stores, categories)}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">수수료</dt>
                <dd>{feeSummary(archiveModalRow)}</dd>
              </div>
            </dl>
            <label className="mt-4 block text-xs font-medium text-sam-muted">보관 사유 (선택)</label>
            <textarea
              value={archiveReasonDraft}
              onChange={(e) => setArchiveReasonDraft(e.target.value)}
              rows={4}
              disabled={busy}
              maxLength={2000}
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm disabled:opacity-50"
              placeholder="운영/감사용 메모"
            />
            {archiveModalError ? (
              <p className="mt-3 rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-helper text-red-900">
                {archiveModalError}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => closeArchiveModal()}
                className="rounded-ui-rect border border-sam-border px-4 py-2 text-sm font-medium text-sam-fg disabled:opacity-40"
              >
                취소
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmArchive()}
                className="rounded-ui-rect bg-sam-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                보관
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {restoreModalRow ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) closeRestoreModal();
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fee-policy-restore-title"
          >
            <h2 id="fee-policy-restore-title" className="text-base font-bold text-sam-fg">
              보관 정책 복구
            </h2>
            <p className="mt-2 sam-text-helper text-sam-muted">
              복구 후 정책이 다시 후보에 올라갑니다.{" "}
              <strong className="text-sam-fg">활성</strong>이면서 같은 적용 대상·기간이 겹치는 정책이 있으면 복구가
              거절될 수 있습니다.
            </p>
            <div className="mt-3 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950">
              동일 priority가 겹치면 복구가 막힐 수 있습니다. 기본 정책은 같은 기간에 둘 이상 둘 수 없습니다.
            </div>
            <dl className="mt-4 space-y-2 sam-text-body-secondary">
              <div>
                <dt className="text-sam-muted">정책명</dt>
                <dd className="font-medium text-sam-fg">{restoreModalRow.policy_name}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">적용 대상</dt>
                <dd>{targetScopeDescription(restoreModalRow, stores, categories)}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">수수료</dt>
                <dd>{feeSummary(restoreModalRow)}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">활성</dt>
                <dd>{restoreModalRow.is_active ? "ON (복구 후 정산 후보 가능)" : "OFF (복구만 되며 정산 후보는 아님)"}</dd>
              </div>
            </dl>
            {restoreModalError ? (
              <p className="mt-3 rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-helper text-red-900">
                {restoreModalError}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => closeRestoreModal()}
                className="rounded-ui-rect border border-sam-border px-4 py-2 text-sm font-medium text-sam-fg disabled:opacity-40"
              >
                취소
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmRestore()}
                className="rounded-ui-rect bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                복구
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

