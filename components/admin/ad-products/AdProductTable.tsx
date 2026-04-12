"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdProduct } from "@/lib/ads/types";
import { AD_TYPE_LABELS } from "@/lib/ads/types";

interface AdProductTableProps {
  products: AdProduct[];
}

export function AdProductTable({ products }: AdProductTableProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<AdProduct>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const startEdit = (p: AdProduct) => {
    setEditing(p.id);
    setForm({ ...p });
  };

  const save = async () => {
    if (!editing || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/ad-products/${editing}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "저장 실패");
        return;
      }
      setEditing(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (products.length === 0) {
    return <p className="py-8 text-center text-[13px] text-sam-muted">광고 상품이 없습니다.</p>;
  }

  return (
    <div className="overflow-x-auto">
      {err ? (
        <p className="mb-2 rounded bg-red-50 px-3 py-2 text-[12px] text-red-700">{err}</p>
      ) : null}
      <table className="w-full min-w-[700px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            {["상품명", "게시판", "유형", "기간", "포인트", "기본 순위", "활성", "관리"].map((h) => (
              <th key={h} className="px-3 py-2 text-left font-semibold text-sam-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const isEditing = editing === p.id;
            return (
              <tr key={p.id} className="border-b border-sam-border-soft hover:bg-sam-app">
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input
                      type="text"
                      value={form.name ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-40 rounded border border-sam-border px-2 py-1 text-[12px]"
                    />
                  ) : (
                    <span className="font-medium text-sam-fg">{p.name}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-sam-muted">{p.boardKey ?? "전체"}</td>
                <td className="px-3 py-2 text-sam-muted">{AD_TYPE_LABELS[p.adType]}</td>
                <td className="px-3 py-2 text-sam-muted">
                  {isEditing ? (
                    <input
                      type="number"
                      value={form.durationDays ?? 3}
                      min={1}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, durationDays: Number(e.target.value) }))
                      }
                      className="w-16 rounded border border-sam-border px-2 py-1 text-[12px]"
                    />
                  ) : (
                    `${p.durationDays}일`
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {isEditing ? (
                    <input
                      type="number"
                      value={form.pointCost ?? 10000}
                      min={0}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, pointCost: Number(e.target.value) }))
                      }
                      className="w-20 rounded border border-sam-border px-2 py-1 text-[12px]"
                    />
                  ) : (
                    `${p.pointCost.toLocaleString()}P`
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {isEditing ? (
                    <input
                      type="number"
                      value={form.priorityDefault ?? 100}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, priorityDefault: Number(e.target.value) }))
                      }
                      className="w-16 rounded border border-sam-border px-2 py-1 text-[12px]"
                    />
                  ) : (
                    p.priorityDefault
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input
                      type="checkbox"
                      checked={form.isActive ?? true}
                      onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                    />
                  ) : (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        p.isActive ? "bg-emerald-100 text-emerald-800" : "bg-sam-surface-muted text-sam-muted"
                      }`}
                    >
                      {p.isActive ? "활성" : "비활성"}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void save()}
                        className="rounded bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                      >
                        저장
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="rounded border border-sam-border bg-sam-surface px-2 py-1 text-[11px] text-sam-muted"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      className="rounded border border-sam-border bg-sam-surface px-2 py-1 text-[11px] text-sam-fg hover:bg-sam-app"
                    >
                      수정
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
