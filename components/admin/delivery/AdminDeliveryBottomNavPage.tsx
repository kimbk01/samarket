"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

type Row = {
  id: string;
  label: string;
  icon_key: string;
  href: string;
  sort_order: number;
  is_active: boolean;
  is_center: boolean;
  requires_store_id: boolean;
  color: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type ListResp = { ok: boolean; items?: Row[]; error?: string };

async function apiList(): Promise<ListResp> {
  const res = await fetch("/api/admin/stores/bottom-nav", { credentials: "include" });
  return (await res.json()) as ListResp;
}

async function apiCreate(payload: Partial<Row>) {
  const res = await fetch("/api/admin/stores/bottom-nav", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as { ok: boolean; item?: Row; error?: string };
}

async function apiUpdate(id: string, patch: Partial<Row>) {
  const res = await fetch("/api/admin/stores/bottom-nav", {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, ...patch }),
  });
  return (await res.json()) as { ok: boolean; item?: Row; error?: string };
}

async function apiDelete(id: string) {
  const res = await fetch(`/api/admin/stores/bottom-nav?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  return (await res.json()) as { ok: boolean; error?: string };
}

function normalizeInt(v: string): number {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

export function AdminDeliveryBottomNavPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Row> | null>(null);
  const [saving, setSaving] = useState(false);

  const [draft, setDraft] = useState<Partial<Row>>({
    label: "",
    icon_key: "home",
    href: "/philife",
    sort_order: 0,
    is_active: true,
    is_center: false,
    requires_store_id: false,
    color: "#1C8DB8",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiList();
      if (!data.ok) {
        setError(data.error ?? "load_failed");
        setRows([]);
      } else {
        setRows((data.items ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const centerCount = useMemo(() => rows.filter((r) => r.is_center).length, [rows]);
  const editingRow = useMemo(
    () => (editingId ? rows.find((r) => r.id === editingId) ?? null : null),
    [editingId, rows]
  );

  const move = useCallback(
    async (id: string, dir: "up" | "down") => {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx < 0) return;
      const nextIdx = dir === "up" ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= rows.length) return;
      const a = rows[idx]!;
      const b = rows[nextIdx]!;
      // Swap sort_order (best-effort) then refetch.
      await apiUpdate(a.id, { sort_order: b.sort_order });
      await apiUpdate(b.id, { sort_order: a.sort_order });
      await load();
    },
    [rows, load]
  );

  const enterEdit = useCallback((r: Row) => {
    setError(null);
    setEditingId(r.id);
    setEditDraft({
      label: r.label,
      icon_key: r.icon_key,
      href: r.href,
      color: r.color,
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditDraft(null);
    setError(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingRow || !editingId || !editDraft) return;
    const label = String(editDraft.label ?? "").trim();
    const icon_key = String(editDraft.icon_key ?? "").trim();
    const href = String(editDraft.href ?? "").trim();
    const color = String(editDraft.color ?? "").trim() || "#1C8DB8";
    if (!label || !icon_key || !href) {
      setError("필수값(label/icon_key/href)을 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      const patch: Partial<Row> = {};
      if (label !== editingRow.label) patch.label = label;
      if (icon_key !== editingRow.icon_key) patch.icon_key = icon_key;
      if (href !== editingRow.href) patch.href = href;
      if (color !== editingRow.color) patch.color = color;
      if (Object.keys(patch).length > 0) {
        const res = await apiUpdate(editingId, patch);
        if (!res.ok) {
          setError(res.error ?? "save_failed");
          return;
        }
      }
      cancelEdit();
      await load();
    } finally {
      setSaving(false);
    }
  }, [editingRow, editingId, editDraft, cancelEdit, load]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <AdminPageHeader
        title="배달 하단 메뉴 설정"
        description="배달(/stores) 도메인 전용 하단 네비 항목을 관리합니다."
      />

      <div className="grid gap-4">
        <AdminCard title="메뉴 추가" className="">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="sam-text-body font-medium text-sam-fg">label</span>
              <input
                className="sam-input"
                value={draft.label ?? ""}
                onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
                placeholder="예: 내주문"
              />
            </label>
            <label className="grid gap-1">
              <span className="sam-text-body font-medium text-sam-fg">icon_key</span>
              <input
                className="sam-input"
                value={draft.icon_key ?? ""}
                onChange={(e) => setDraft((p) => ({ ...p, icon_key: e.target.value }))}
                placeholder="orders | cart | home | store | user"
              />
            </label>
            <label className="grid gap-1 sm:col-span-2">
              <span className="sam-text-body font-medium text-sam-fg">href</span>
              <input
                className="sam-input"
                value={draft.href ?? ""}
                onChange={(e) => setDraft((p) => ({ ...p, href: e.target.value }))}
                placeholder="/my/store-orders"
              />
            </label>
            <label className="grid gap-1">
              <span className="sam-text-body font-medium text-sam-fg">sort_order</span>
              <input
                className="sam-input"
                inputMode="numeric"
                value={String(draft.sort_order ?? 0)}
                onChange={(e) => setDraft((p) => ({ ...p, sort_order: normalizeInt(e.target.value) }))}
              />
            </label>
            <label className="grid gap-1">
              <span className="sam-text-body font-medium text-sam-fg">color</span>
              <input
                className="sam-input"
                value={draft.color ?? "#1C8DB8"}
                onChange={(e) => setDraft((p) => ({ ...p, color: e.target.value }))}
                placeholder="#1C8DB8"
              />
            </label>
            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <label className="inline-flex items-center gap-2 sam-text-body text-sam-fg">
                <input
                  type="checkbox"
                  checked={Boolean(draft.is_active)}
                  onChange={(e) => setDraft((p) => ({ ...p, is_active: e.target.checked }))}
                />
                is_active
              </label>
              <label className="inline-flex items-center gap-2 sam-text-body text-sam-fg">
                <input
                  type="checkbox"
                  checked={Boolean(draft.requires_store_id)}
                  onChange={(e) => setDraft((p) => ({ ...p, requires_store_id: e.target.checked }))}
                />
                requires_store_id
              </label>
              <label className="inline-flex items-center gap-2 sam-text-body text-sam-fg">
                <input
                  type="checkbox"
                  checked={Boolean(draft.is_center)}
                  onChange={(e) => setDraft((p) => ({ ...p, is_center: e.target.checked }))}
                />
                is_center (현재 {centerCount}개)
              </label>
              <button
                className="sam-btn-primary"
                onClick={async () => {
                  setError(null);
                  const res = await apiCreate(draft);
                  if (!res.ok) {
                    setError(res.error ?? "create_failed");
                    return;
                  }
                  setDraft((p) => ({ ...p, label: "" }));
                  await load();
                }}
              >
                추가
              </button>
              <button className="sam-btn" onClick={load}>
                새로고침
              </button>
            </div>
            {error ? <p className="sam-text-body text-red-600">{error}</p> : null}
          </div>
        </AdminCard>

        <AdminCard title="메뉴 목록">
          {loading ? (
            <div className="sam-text-body text-sam-muted">불러오는 중...</div>
          ) : (
            <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
              <table className="w-full min-w-[980px] border-collapse sam-text-body">
                <thead>
                  <tr className="border-b border-sam-border bg-sam-app">
                    <th className="px-3 py-2 text-left font-medium text-sam-fg">순서</th>
                    <th className="px-3 py-2 text-left font-medium text-sam-fg">메뉴명</th>
                    <th className="px-3 py-2 text-left font-medium text-sam-fg">아이콘키</th>
                    <th className="px-3 py-2 text-left font-medium text-sam-fg">링크</th>
                    <th className="px-3 py-2 text-center font-medium text-sam-fg">노출</th>
                    <th className="px-3 py-2 text-center font-medium text-sam-fg">센터</th>
                    <th className="px-3 py-2 text-center font-medium text-sam-fg">store_id</th>
                    <th className="px-3 py-2 text-left font-medium text-sam-fg">색</th>
                    <th className="px-3 py-2 text-right font-medium text-sam-fg">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const isEditing = editingId === r.id;
                    return (
                      <tr key={r.id} className="border-b border-sam-border-soft hover:bg-sam-app/50">
                        <td className="px-3 py-2 text-sam-muted">{r.sort_order}</td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <input
                              className="sam-input !h-9"
                              value={String(editDraft?.label ?? "")}
                              onChange={(e) => setEditDraft((p) => ({ ...(p ?? {}), label: e.target.value }))}
                            />
                          ) : (
                            <span className="font-medium text-sam-fg">{r.label}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <select
                              className="sam-input !h-9"
                              value={String(editDraft?.icon_key ?? "")}
                              onChange={(e) => setEditDraft((p) => ({ ...(p ?? {}), icon_key: e.target.value }))}
                            >
                              {["orders", "cart", "home", "store", "user"].map((k) => (
                                <option key={k} value={k}>
                                  {k}
                                </option>
                              ))}
                              <option value={String(editDraft?.icon_key ?? "")}>custom: {String(editDraft?.icon_key ?? "")}</option>
                            </select>
                          ) : (
                            <span className="sam-text-helper text-sam-muted">{r.icon_key}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <input
                              className="sam-input !h-9 min-w-[260px]"
                              value={String(editDraft?.href ?? "")}
                              onChange={(e) => setEditDraft((p) => ({ ...(p ?? {}), href: e.target.value }))}
                            />
                          ) : (
                            <span className="sam-text-helper text-sam-muted">{r.href}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => void apiUpdate(r.id, { is_active: !r.is_active }).then(load)}
                            className={`rounded px-1.5 py-0.5 sam-text-helper ${
                              r.is_active ? "text-signature hover:bg-signature/10" : "text-sam-muted hover:bg-sam-border-soft"
                            }`}
                            title="노출 토글"
                          >
                            {r.is_active ? "ON" : "OFF"}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => void apiUpdate(r.id, { is_center: true }).then(load)}
                            className={`rounded px-1.5 py-0.5 sam-text-helper ${
                              r.is_center ? "text-signature hover:bg-signature/10" : "text-sam-muted hover:bg-sam-border-soft"
                            }`}
                            title="센터는 1개만 유지됩니다."
                          >
                            {r.is_center ? "센터" : "일반"}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => void apiUpdate(r.id, { requires_store_id: !r.requires_store_id }).then(load)}
                            className={`rounded px-1.5 py-0.5 sam-text-helper ${
                              r.requires_store_id ? "text-signature hover:bg-signature/10" : "text-sam-muted hover:bg-sam-border-soft"
                            }`}
                            title="store_id 필요 여부"
                          >
                            {r.requires_store_id ? "필요" : "불필요"}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <input
                                className="sam-input !h-9 w-[120px]"
                                value={String(editDraft?.color ?? "")}
                                onChange={(e) => setEditDraft((p) => ({ ...(p ?? {}), color: e.target.value }))}
                              />
                              <input
                                type="color"
                                value={String(editDraft?.color ?? "#1C8DB8")}
                                onChange={(e) => setEditDraft((p) => ({ ...(p ?? {}), color: e.target.value }))}
                                className="h-9 w-10 rounded border border-sam-border bg-sam-surface"
                                aria-label="색상 선택"
                              />
                            </div>
                          ) : (
                            <span className="sam-text-helper text-sam-muted">{r.color}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => void move(r.id, "up")}
                              disabled={idx === 0}
                              className="rounded p-1 text-sam-muted hover:bg-sam-border-soft disabled:opacity-40"
                              title="위로"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              onClick={() => void move(r.id, "down")}
                              disabled={idx === rows.length - 1}
                              className="rounded p-1 text-sam-muted hover:bg-sam-border-soft disabled:opacity-40"
                              title="아래로"
                            >
                              ▼
                            </button>
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => void saveEdit()}
                                  className="rounded px-1.5 py-0.5 sam-text-helper text-signature hover:bg-signature/10 disabled:opacity-50"
                                >
                                  저장
                                </button>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={cancelEdit}
                                  className="rounded px-1.5 py-0.5 sam-text-helper text-sam-muted hover:bg-sam-border-soft disabled:opacity-50"
                                >
                                  취소
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => enterEdit(r)}
                                className="rounded px-1.5 py-0.5 sam-text-helper text-signature hover:bg-signature/10"
                              >
                                수정
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                if (!confirm("삭제할까요?")) return;
                                await apiDelete(r.id);
                                if (editingId === r.id) cancelEdit();
                                await load();
                              }}
                              className="rounded px-1.5 py-0.5 sam-text-helper text-red-600 hover:bg-red-50"
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      </div>
    </div>
  );
}

