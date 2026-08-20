"use client";

import { useState } from "react";
import { MOCK_RECENT_TRADES } from "./mock-data";
import { ProtoButton, SectionHeader, TabStrip } from "./trade-prototype-ui";

const OPS_TABS = [
  { id: "all", label: "전체", count: null, disconnected: true },
  { id: "inquiry", label: "문의", count: null, disconnected: true },
  { id: "negotiating", label: "협상중", count: null, disconnected: true },
  { id: "completed", label: "판매완료", count: null, disconnected: true },
  { id: "confirm", label: "구매자확인", count: 3, disconnected: false },
  { id: "review", label: "후기완료", count: null, disconnected: true },
  { id: "archived", label: "보관", count: null, disconnected: true },
];

export function TradePrototypeOperationsPage() {
  const [tab, setTab] = useState("all");

  return (
    <div className="space-y-3">
      <SectionHeader
        title="거래 운영"
        description="trade-flow + trade-complete 통합 — product_chats / chat_rooms authority 유지."
        actions={<ProtoButton variant="secondary">새로고침</ProtoButton>}
      />

      <TabStrip tabs={OPS_TABS} active={tab} onChange={setTab} />

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="w-full table-fixed text-left sam-text-body-secondary">
          <thead className="border-b border-sam-border bg-sam-surface-muted/50 sam-text-xxs text-sam-muted">
            <tr>
              <th className="w-[18%] px-3 py-2">상품</th>
              <th className="w-[10%] px-3 py-2">판매자</th>
              <th className="w-[10%] px-3 py-2">구매자</th>
              <th className="w-[14%] px-3 py-2">거래 상태</th>
              <th className="w-[10%] px-3 py-2">채팅 모드</th>
              <th className="w-[10%] px-3 py-2">판매자 완료</th>
              <th className="w-[10%] px-3 py-2">구매자 확인</th>
              <th className="w-[8%] px-3 py-2">후기</th>
              <th className="w-[10%] px-3 py-2">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sam-border-soft">
            {MOCK_RECENT_TRADES.map((row) => (
              <tr key={`${row.postTitle}-${row.buyer}`} className="hover:bg-sam-surface-muted/40">
                <td className="truncate px-3 py-2 font-medium text-sam-fg">{row.postTitle}</td>
                <td className="px-3 py-2">{row.seller}</td>
                <td className="px-3 py-2 font-mono sam-text-xxs">{row.buyer}</td>
                <td className="px-3 py-2 font-mono sam-text-xxs">{row.flow}</td>
                <td className="px-3 py-2 font-mono sam-text-xxs">open</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2">N</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <ProtoButton variant="ghost" size="sm">
                    되돌리기
                  </ProtoButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-sam-border px-3 py-2 sam-text-xxs text-sam-muted">
          fixture {MOCK_RECENT_TRADES.length}건 · product_chats 실데이터 미연결
        </p>
      </div>

      <p className="sam-text-xxs text-sam-muted">
        기존 /admin/trade-flow · /admin/chats/trade-complete route는 이 화면으로 redirect/link 예정 (제품 반영 단계).
      </p>
    </div>
  );
}
