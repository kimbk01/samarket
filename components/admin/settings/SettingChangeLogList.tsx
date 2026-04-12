"use client";

import { useMemo, useState } from "react";
import type { SettingChangeLog } from "@/lib/types/admin-settings";
import { getSettingChangeLogs } from "@/lib/admin-settings/mock-setting-change-logs";
import type { AppSettings } from "@/lib/types/admin-settings";

const PAGE_SIZE = 30;

/** 설정 키 한글 라벨 (일반 설정 등) */
const KEY_LABELS: Partial<Record<keyof AppSettings, string>> = {
  siteName: "사이트명",
  defaultCurrency: "기본 통화",
  defaultLocale: "기본 로케일",
  alarmSoundDataUrl: "알람 사운드",
  speedDisplayLabel: "스피드 표시 라벨",
  productAutoExpireDays: "상품 자동 만료(일)",
  maxProductImages: "최대 상품 이미지 수",
  allowPriceOffer: "가격 제안 허용",
  allowProductBoost: "끌어올리기 허용",
  boostCooldownHours: "끌어올리기 쿨다운(시간)",
  chatEnabled: "채팅 사용",
  allowChatAfterSold: "판매 후 채팅 허용",
  maxMessageLength: "최대 메시지 길이",
  reportEnabled: "신고 사용",
  maxReportsPerTarget: "대상당 최대 신고 수",
  trustReviewEnabled: "후기 사용",
  mannerScoreVisible: "매너 점수 공개",
  regionMultiSelectEnabled: "지역 다중 선택",
  maxSavedRegions: "최대 저장 지역 수",
  homeRadiusKm: "홈 반경(km)",
};

function getKeyLabel(key: string): string {
  return KEY_LABELS[key as keyof AppSettings] ?? key;
}

interface SettingChangeLogListProps {
  refreshKey?: number;
}

export function SettingChangeLogList({ refreshKey = 0 }: SettingChangeLogListProps) {
  const [page, setPage] = useState(1);

  const result = useMemo(
    () => getSettingChangeLogs({ page, pageSize: PAGE_SIZE }),
    [page, refreshKey]
  );

  const { logs, total, totalPages, page: currentPage } = result as {
    logs: SettingChangeLog[];
    total: number;
    totalPages: number;
    page: number;
  };

  const from = (currentPage - 1) * PAGE_SIZE + 1;
  const to = Math.min(currentPage * PAGE_SIZE, total);

  if (logs.length === 0 && total === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-app/50 py-10 text-center">
        <p className="text-[14px] text-sam-muted">설정 변경 이력이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-sam-border-soft pb-3">
        <h3 className="text-[15px] font-semibold text-sam-fg">
          설정 변경 이력
        </h3>
        <p className="text-[13px] text-sam-muted">
          전체 {total}건 · {currentPage}/{totalPages}페이지
        </p>
      </div>

      <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-sam-border bg-sam-app">
              <th className="whitespace-nowrap px-3 py-2.5 font-medium text-sam-fg">
                번호
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 font-medium text-sam-fg">
                설정 항목
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 font-medium text-sam-fg">
                이전 값
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 font-medium text-sam-fg">
                변경 값
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 font-medium text-sam-fg">
                변경자
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 font-medium text-sam-fg">
                변경 일시
              </th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log, i) => (
              <tr
                key={log.id}
                className="border-b border-sam-border-soft last:border-0 hover:bg-sam-app/50"
              >
                <td className="px-3 py-2.5 text-sam-muted">
                  {from + i}
                </td>
                <td className="px-3 py-2.5 font-medium text-sam-fg">
                  {getKeyLabel(log.key)}
                </td>
                <td className="max-w-[140px] truncate px-3 py-2.5 text-sam-muted" title={log.oldValue}>
                  {log.oldValue}
                </td>
                <td className="max-w-[140px] truncate px-3 py-2.5 text-sam-fg" title={log.newValue}>
                  {log.newValue}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-sam-muted">
                  {log.adminNickname}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-sam-muted">
                  {new Date(log.createdAt).toLocaleString("ko-KR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-sam-border-soft pt-3">
          <p className="text-[13px] text-sam-muted">
            {from}–{to} / {total}건
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="rounded border border-sam-border px-3 py-1.5 text-[13px] text-sam-fg disabled:opacity-40 hover:bg-sam-app"
            >
              이전
            </button>
            <span className="px-2 text-[13px] text-sam-muted">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="rounded border border-sam-border px-3 py-1.5 text-[13px] text-sam-fg disabled:opacity-40 hover:bg-sam-app"
            >
              다음
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
