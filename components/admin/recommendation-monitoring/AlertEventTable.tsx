"use client";

import { useMemo, useState } from "react";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import {
  getRecommendationAlertEvents,
  acknowledgeAlertEvent,
} from "@/lib/recommendation-monitoring/mock-recommendation-alert-events";
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

  const handleAck = (id: string) => {
    acknowledgeAlertEvent(id, ADMIN_ID);
    setRefresh((r) => r + 1);
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
          className="rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          <option value="">전체</option>
          <option value="unack">미확인</option>
          <option value="ack">확인됨</option>
        </select>
      </div>
      {events.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          알림 이벤트가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[560px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  일시
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  surface
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  심각도
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  메시지
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  확인
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-600">
                    {new Date(e.createdAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    {SURFACE_LABELS[e.surface]}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[12px] ${
                        e.severity === "critical"
                          ? "bg-red-50 text-red-800"
                          : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {e.severity}
                    </span>
                  </td>
                  <td className="max-w-[280px] truncate px-3 py-2.5 text-gray-700">
                    {e.message}
                  </td>
                  <td className="px-3 py-2.5">
                    {e.isAcknowledged ? (
                      <span className="text-[13px] text-gray-500">
                        확인됨
                        {e.acknowledgedAt &&
                          ` ${new Date(e.acknowledgedAt).toLocaleString("ko-KR")}`}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAck(e.id)}
                        className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[13px] text-gray-700"
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
