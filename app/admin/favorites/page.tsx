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
      <p className="sam-text-body-secondary text-sam-muted">
        사용자 화면 「찜 목록」(
        <code className="rounded bg-sam-surface-muted px-1">{MYPAGE_TRADE_FAVORITES_HREF}</code>)은{" "}
        <code className="rounded bg-sam-surface-muted px-1">GET /api/favorites/list</code> → <code className="rounded bg-sam-surface-muted px-1">favorites</code> 테이블과
        동일합니다. 아래 로그는 <code className="rounded bg-sam-surface-muted px-1">POST /api/favorites/toggle</code> 성공 시
        <code className="rounded bg-sam-surface-muted px-1">favorite_audit_log</code>에 쌓인 감사 기록입니다 (
        <code className="rounded bg-sam-surface-muted px-1">GET /api/admin/favorite-audit</code>).
      </p>
      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          불러오는 중…
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          favorite_audit_log 테이블이 없거나 비어 있습니다. 마이그레이션 20250319120000_favorite_count_and_audit.sql 적용 후 찜 동작 시 로그가 쌓입니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full text-left sam-text-body-secondary">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 font-medium text-sam-fg">시각</th>
                <th className="px-3 py-2.5 font-medium text-sam-fg">동작</th>
                <th className="px-3 py-2.5 font-medium text-sam-fg">user_id</th>
                <th className="px-3 py-2.5 font-medium text-sam-fg">post_id</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => (
                <tr key={row.id} className="border-b border-sam-border-soft">
                  <td className="px-3 py-2 text-sam-muted">
                    {new Date(row.created_at).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        row.action === "add"
                          ? "text-green-600 font-medium"
                          : "text-sam-muted"
                      }
                    >
                      {row.action === "add" ? "찜 추가" : "찜 해제"}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono sam-text-helper text-sam-fg">
                    {row.user_id.slice(0, 8)}…
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/products/${row.post_id}`}
                      className="font-mono sam-text-helper text-signature hover:underline"
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
