"use client";

import { useMemo, useState } from "react";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import {
  getRecommendationAlertEvents,
  acknowledgeAlertEvent,
} from "@/lib/recommendation-monitoring/mock-recommendation-alert-events";
import { persistRecommendationRuntimeToServer } from "@/lib/recommendation-ops/recommendation-runtime-sync-client";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

const ADMIN_ID = "admin1";

export function AlertEventTable() {
  const [refresh, setRefresh] = useState(0);
  const [ackFilter, setAckFilter] = useState<boolean | "">("");

  const events = useMemo(
    () =>
      getRecommendationAlertEvents({
        isAcknowledged: ackFilter === "" ? undefined : ackFilter,
        limit: 50,
      }),
    [refresh, ackFilter]
  );

  const handleAck = async (id: string) => {
    acknowledgeAlertEvent(id, ADMIN_ID);
    setRefresh((r) => r + 1);
    const r = await persistRecommendationRuntimeToServer();
    if (!r.ok) console.warn("[alert-event] persist failed", r.error);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={ackFilter === "" ? "" : ackFilter ? "ack" : "unack"}
          onChange={(e) => {
            const v = e.target.value;
            setAckFilter(v === "" ? "" : v === "ack");
          }}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="">전체</option>
          <option value="unack">미확인</option>
          <option value="ack">확인됨</option>
        </select>
      </div>
      {events.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          알림 이벤트가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[560px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  일시
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  surface
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  심각도
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  메시지
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  확인
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                    {new Date(e.createdAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {SURFACE_LABELS[e.surface]}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 sam-text-helper ${
                        e.severity === "critical"
                          ? "bg-red-50 text-red-800"
                          : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {e.severity}
                    </span>
                  </td>
                  <td className="max-w-[280px] truncate px-3 py-2.5 text-sam-fg">
                    {e.message}
                  </td>
                  <td className="px-3 py-2.5">
                    {e.isAcknowledged ? (
                      <span className="sam-text-body-secondary text-sam-muted">
                        확인됨
                        {e.acknowledgedAt &&
                          ` ${new Date(e.acknowledgedAt).toLocaleString("ko-KR")}`}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAck(e.id)}
                        className="rounded border border-sam-border bg-sam-app px-2 py-1 sam-text-body-secondary text-sam-fg"
                      >
                        확인
                      </button>
                    )}
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
