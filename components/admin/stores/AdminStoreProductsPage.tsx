"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { formatMoneyPhp } from "@/lib/utils/format";

type Row = {
  id: string;
  store_id: string;
  title: string;
  price: number;
  product_status: string;
  admin_review_status: string;
  thumbnail_url: string | null;
  created_at: string;
  store: { store_name: string; slug: string } | null;
};

const FILTERS = [
  { value: "all", label: "전체" },
  { value: "active", label: "판매중" },
  { value: "draft", label: "초안" },
  { value: "hidden", label: "숨김" },
  { value: "blocked", label: "차단" },
  { value: "sold_out", label: "품절" },
];

export function AdminStoreProductsPage() {
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const qs = useMemo(
    () => (filter === "all" ? "" : `?status=${encodeURIComponent(filter)}`),
    [filter]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/store-products${qs}`, { credentials: "include" });
      const json = await res.json();
      if (res.status === 403) {
        setError("관리자 권한이 없습니다.");
        setRows([]);
        return;
      }
      if (!json?.ok) {
        setError(json?.error ?? "load_failed");
        setRows([]);
        return;
      }
      setRows(json.products ?? []);
    } catch {
      setError("network_error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (id: string, action: string) => {
    const memo =
      action === "block" || action === "hide"
        ? window.prompt("메모(선택)", "")?.trim() || null
        : null;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/store-products/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, memo }),
      });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.error ?? "failed");
        return;
      }
      await load();
    } catch {
      setError("network_error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title="매장 상품 검수" />
      <p className="text-[13px] text-gray-600">
        차단(blocked)·숨김·판매중 복구. 공개 목록은 <code className="rounded bg-gray-100 px-1">active</code> 만
        노출됩니다.
      </p>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${
              filter === f.value
                ? "bg-gray-900 text-white"
                : "border border-gray-200 bg-white text-gray-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-[14px] text-gray-500">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          상품이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-[900px] w-full border-collapse text-left text-[13px]">
            <thead className="border-b border-gray-200 bg-gray-50 text-[12px] text-gray-600">
              <tr>
                <th className="px-3 py-2 font-medium">상품</th>
                <th className="px-3 py-2 font-medium">매장</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2 font-medium">검수</th>
                <th className="px-3 py-2 font-medium">액션</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const dis = busyId === r.id;
                return (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="px-3 py-2 align-top">
                      <div className="flex gap-2">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-gray-100">
                          {r.thumbnail_url ? (
                             
                            <img src={r.thumbnail_url} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{r.title}</div>
                          <div className="text-[12px] text-gray-500">
                            {typeof r.price === "number" ? formatMoneyPhp(r.price) : r.price}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top text-[12px] text-gray-700">
                      {r.store?.store_name ?? "-"}
                      <div className="text-[11px] text-gray-400">/{r.store?.slug}</div>
                    </td>
                    <td className="px-3 py-2 align-top">{r.product_status}</td>
                    <td className="px-3 py-2 align-top text-[12px]">{r.admin_review_status}</td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-col gap-1">
                        {r.product_status !== "blocked" && (
                          <button
                            type="button"
                            disabled={dis}
                            className="rounded border border-red-200 bg-red-50 px-2 py-1 text-left text-[12px] text-red-900 disabled:opacity-50"
                            onClick={() => void run(r.id, "block")}
                          >
                            차단
                          </button>
                        )}
                        {r.product_status === "active" && (
                          <button
                            type="button"
                            disabled={dis}
                            className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-left text-[12px] disabled:opacity-50"
                            onClick={() => void run(r.id, "hide")}
                          >
                            숨김
                          </button>
                        )}
                        {r.product_status !== "active" && r.product_status !== "deleted" && (
                          <button
                            type="button"
                            disabled={dis}
                            className="rounded border border-green-200 bg-green-50 px-2 py-1 text-left text-[12px] text-green-900 disabled:opacity-50"
                            onClick={() => void run(r.id, "activate")}
                          >
                            판매중(복구)
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
