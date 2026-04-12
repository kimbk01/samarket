"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { MessengerMonitoringSummary } from "@/lib/community-messenger/monitoring/types";
import { MESSENGER_PERF_THRESHOLDS } from "@/lib/community-messenger/monitoring/thresholds";

type SummaryResponse = { ok?: boolean; summary?: MessengerMonitoringSummary };

export function AdminMessengerMonitoringPage() {
  const [summary, setSummary] = useState<MessengerMonitoringSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/community-messenger/monitoring/summary", { cache: "no-store" });
      const json = (await res.json()) as SummaryResponse;
      if (res.ok && json.ok && json.summary) {
        setSummary(json.summary);
      } else {
        setSummary(null);
        setError("요약을 불러오지 못했습니다.");
      }
    } catch {
      setSummary(null);
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const apiRows = summary ? Object.entries(summary.apiByRoute) : [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="커뮤니티 메신저 · 성능 모니터링"
        description="프로세스 인메모리 집계(샘플). 멀티 인스턴스에서는 노드별로 다를 수 있습니다. 클라이언트 이벤트는 로그인 사용자 POST로 수집됩니다."
      />

      <AdminCard title="임계값 (환경 변수로 조정 가능)">
        <pre className="overflow-x-auto rounded-ui-rect bg-sam-app p-4 text-[12px] leading-relaxed text-sam-fg">
          {JSON.stringify(MESSENGER_PERF_THRESHOLDS, null, 2)}
        </pre>
      </AdminCard>

      <AdminCard title="서버 API 라우트 (평균·최근 ms)">
        {loading ? (
          <p className="text-[14px] text-sam-muted">불러오는 중…</p>
        ) : error ? (
          <p className="text-[14px] text-red-600">{error}</p>
        ) : apiRows.length === 0 ? (
          <p className="text-[14px] text-sam-muted">아직 기록이 없습니다. 방 부트스트랩·메시지 API를 호출하면 쌓입니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-sam-border">
                  <th className="py-2 pr-3 font-semibold text-sam-fg">route</th>
                  <th className="py-2 pr-3 font-semibold text-sam-fg">n</th>
                  <th className="py-2 pr-3 font-semibold text-sam-fg">avg ms</th>
                  <th className="py-2 font-semibold text-sam-fg">last ms</th>
                </tr>
              </thead>
              <tbody>
                {apiRows.map(([route, v]) => (
                  <tr key={route} className="border-b border-sam-border/60">
                    <td className="py-2 pr-3 font-mono text-[11px] text-sam-muted">{route}</td>
                    <td className="py-2 pr-3 text-sam-fg">{v.count}</td>
                    <td className="py-2 pr-3 text-sam-fg">{v.avgMs.toFixed(1)}</td>
                    <td className="py-2 text-sam-fg">{v.lastMs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      <AdminCard title="최근 알림 (임계 초과)">
        {!summary?.recentAlerts?.length ? (
          <p className="text-[14px] text-sam-muted">알림 없음</p>
        ) : (
          <ul className="space-y-2">
            {summary.recentAlerts.slice(0, 20).map((a, i) => (
              <li key={`${a.ts}-${i}`} className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[12px] text-sam-fg">
                <span className="text-sam-muted">{new Date(a.ts).toLocaleString("ko-KR")}</span> — {a.message}
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <AdminCard title="클라이언트 집계 (키별 평균)">
        {!summary?.clientAggregates || Object.keys(summary.clientAggregates).length === 0 ? (
          <p className="text-[14px] text-sam-muted">클라이언트 이벤트 없음 (방 입장·전송·통화 후 갱신)</p>
        ) : (
          <pre className="max-h-[320px] overflow-auto rounded-ui-rect bg-sam-app p-4 text-[11px] leading-relaxed text-sam-fg">
            {JSON.stringify(summary.clientAggregates, null, 2)}
          </pre>
        )}
      </AdminCard>

      <AdminCard title="전체 집계 (서버+클라이언트 이벤트 키)">
        {!summary?.aggregates || Object.keys(summary.aggregates).length === 0 ? (
          <p className="text-[14px] text-sam-muted">집계 없음</p>
        ) : (
          <pre className="max-h-[360px] overflow-auto rounded-ui-rect bg-sam-app p-4 text-[11px] leading-relaxed text-sam-fg">
            {JSON.stringify(summary.aggregates, null, 2)}
          </pre>
        )}
      </AdminCard>

      <p className="text-[12px] text-sam-muted">
        생성 시각: {summary?.generatedAt ?? "—"} · 윈도우 이벤트 수: {summary?.windowEvents ?? 0}
      </p>
    </div>
  );
}
