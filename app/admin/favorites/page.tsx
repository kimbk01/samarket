"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { getFavoriteAuditLog, type FavoriteAuditRow } from "@/lib/admin-favorites/getFavoriteAuditLog";
import Link from "next/link";
import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";

export default function AdminFavoritesPage() {
  const [logs, setLogs] = useState<FavoriteAuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await getFavoriteAuditLog(200);
    setLogs(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <AdminPageHeader title="찜/관심 관리" />
      <p className="text-[13px] text-gray-600">
        사용자 화면 「찜 목록」(
        <code className="rounded bg-gray-100 px-1">{MYPAGE_TRADE_FAVORITES_HREF}</code>)은{" "}
        <code className="rounded bg-gray-100 px-1">GET /api/favorites/list</code> → <code className="rounded bg-gray-100 px-1">favorites</code> 테이블과
        동일합니다. 아래 로그는 <code className="rounded bg-gray-100 px-1">POST /api/favorites/toggle</code> 성공 시
        <code className="rounded bg-gray-100 px-1">favorite_audit_log</code>에 쌓인 감사 기록입니다 (
        <code className="rounded bg-gray-100 px-1">GET /api/admin/favorite-audit</code>).
      </p>
      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          불러오는 중…
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          favorite_audit_log 테이블이 없거나 비어 있습니다. 마이그레이션 20250319120000_favorite_count_and_audit.sql 적용 후 찜 동작 시 로그가 쌓입니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2.5 font-medium text-gray-700">시각</th>
                <th className="px-3 py-2.5 font-medium text-gray-700">동작</th>
                <th className="px-3 py-2.5 font-medium text-gray-700">user_id</th>
                <th className="px-3 py-2.5 font-medium text-gray-700">post_id</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="px-3 py-2 text-gray-600">
                    {new Date(row.created_at).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        row.action === "add"
                          ? "text-green-600 font-medium"
                          : "text-gray-500"
                      }
                    >
                      {row.action === "add" ? "찜 추가" : "찜 해제"}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[12px] text-gray-700">
                    {row.user_id.slice(0, 8)}…
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/products/${row.post_id}`}
                      className="font-mono text-[12px] text-signature hover:underline"
                    >
                      {row.post_id.slice(0, 8)}…
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
