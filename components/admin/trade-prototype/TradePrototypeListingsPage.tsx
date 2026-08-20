"use client";

import Link from "next/link";
import { useState } from "react";
import { MOCK_LISTINGS, MOCK_TOTAL_LISTINGS } from "./mock-data";
import { TRADE_PROTOTYPE_BASE } from "./trade-prototype-nav";
import {
  FilterChip,
  ProtoButton,
  RowMenuMock,
  SectionHeader,
  TabStrip,
  TradePromoBadge,
  TradeStatusBadge,
} from "./trade-prototype-ui";

const STATUS_TABS = [
  { id: "all", label: "전체", count: MOCK_TOTAL_LISTINGS, disconnected: false },
  { id: "active", label: "판매중", count: null, disconnected: true },
  { id: "sold", label: "판매완료", count: null, disconnected: true },
  { id: "hidden", label: "숨김", count: null, disconnected: true },
  { id: "reported", label: "신고 있음", count: null, disconnected: true },
];

export function TradePrototypeListingsPage() {
  const [tab, setTab] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [appliedFilters, setAppliedFilters] = useState<string[]>([]);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const pageSize = 40;
  const page = 1;
  const shown = MOCK_LISTINGS.length;
  const rangeStart = shown === 0 ? 0 : 1;
  const rangeEnd = shown;

  const toggleAll = () => {
    if (selected.size === MOCK_LISTINGS.length) setSelected(new Set());
    else setSelected(new Set(MOCK_LISTINGS.map((r) => r.id)));
  };

  const applyFilters = () => {
    const chips: string[] = [];
    const subject = (document.getElementById("proto-filter-subject") as HTMLSelectElement | null)?.value;
    if (subject && subject !== "주제 전체") chips.push(subject);
    setAppliedFilters(chips);
    setFilterOpen(false);
  };

  return (
    <div className="space-y-3">
      <SectionHeader
        title="게시물 관리"
        description="Marketplace에 등록된 모든 거래 게시물을 관리합니다."
        actions={
          <>
            <span className="sam-text-body-secondary tabular-nums text-sam-muted">
              전체 {MOCK_TOTAL_LISTINGS}
            </span>
            <ProtoButton variant="secondary">새로고침</ProtoButton>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="제목 · 판매자 · ID 검색"
          className={`${"sam-input"} max-w-md flex-1 min-w-[200px]`}
        />
        <ProtoButton variant="secondary" onClick={() => setFilterOpen((v) => !v)}>
          필터
        </ProtoButton>
      </div>

      <TabStrip tabs={STATUS_TABS} active={tab} onChange={setTab} />

      {filterOpen ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <fieldset>
              <legend className="mb-1 sam-text-xxs font-semibold text-sam-muted">분류</legend>
              <select id="proto-filter-subject" className="sam-select w-full" defaultValue="주제 전체">
                <option>주제 전체</option>
                <option>중고차</option>
                <option>알바</option>
              </select>
              <select className="sam-select mt-1 w-full">
                <option>카테고리 전체</option>
              </select>
            </fieldset>
            <fieldset>
              <legend className="mb-1 sam-text-xxs font-semibold text-sam-muted">노출</legend>
              <label className="flex items-center gap-2 sam-text-body-secondary">
                <input type="checkbox" /> 공개
              </label>
              <label className="mt-1 flex items-center gap-2 sam-text-body-secondary">
                <input type="checkbox" /> 비공개
              </label>
            </fieldset>
            <fieldset>
              <legend className="mb-1 sam-text-xxs font-semibold text-sam-muted">신고 · 광고</legend>
              <label className="flex items-center gap-2 sam-text-body-secondary">
                <input type="checkbox" /> 신고 있음
              </label>
              <label className="mt-1 flex items-center gap-2 sam-text-body-secondary">
                <input type="checkbox" /> 홍보중
              </label>
            </fieldset>
            <fieldset>
              <legend className="mb-1 sam-text-xxs font-semibold text-sam-muted">등록일</legend>
              <input type="date" className="sam-input w-full" />
            </fieldset>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <ProtoButton variant="primary" size="sm" onClick={applyFilters}>
              적용
            </ProtoButton>
            <ProtoButton
              variant="ghost"
              size="sm"
              onClick={() => {
                setAppliedFilters([]);
                setFilterOpen(false);
              }}
            >
              초기화
            </ProtoButton>
          </div>
        </div>
      ) : null}

      {appliedFilters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {appliedFilters.map((label) => (
            <FilterChip
              key={label}
              label={label}
              onRemove={() => setAppliedFilters((prev) => prev.filter((x) => x !== label))}
            />
          ))}
          <button
            type="button"
            className="sam-text-xxs text-signature hover:underline"
            onClick={() => setAppliedFilters([])}
          >
            모두 초기화
          </button>
        </div>
      ) : null}

      {selected.size > 0 ? (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
          <span className="sam-text-body-secondary font-medium">{selected.size}개 선택됨</span>
          <ProtoButton variant="secondary" size="sm">
            노출
          </ProtoButton>
          <ProtoButton variant="secondary" size="sm">
            숨김
          </ProtoButton>
          <ProtoButton variant="secondary" size="sm">
            운영 삭제
          </ProtoButton>
        </div>
      ) : null}

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="w-full table-fixed text-left sam-text-body-secondary">
          <thead className="border-b border-sam-border bg-sam-surface-muted/80 sam-text-xxs text-sam-muted">
            <tr>
              <th className="w-8 px-2 py-2">
                <input
                  type="checkbox"
                  checked={selected.size === MOCK_LISTINGS.length && MOCK_LISTINGS.length > 0}
                  onChange={toggleAll}
                  aria-label="전체 선택"
                />
              </th>
              <th className="w-[18%] px-2 py-2">상품</th>
              <th className="w-[11%] px-2 py-2">판매자</th>
              <th className="w-[13%] px-2 py-2">분류</th>
              <th className="w-[9%] px-2 py-2">가격</th>
              <th className="w-[11%] px-2 py-2">지역</th>
              <th className="w-[8%] px-2 py-2">상태</th>
              <th className="w-[5%] px-2 py-2 text-center">찜</th>
              <th className="w-[5%] px-2 py-2 text-center">채팅</th>
              <th className="w-[5%] px-2 py-2 text-center">신고</th>
              <th className="w-[7%] px-2 py-2">광고</th>
              <th className="w-[8%] px-2 py-2">등록일</th>
              <th className="w-12 px-2 py-2 text-center">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sam-border-soft">
            {MOCK_LISTINGS.map((row) => (
              <tr key={row.id} className="hover:bg-sam-surface-muted/40">
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(row.id)) next.delete(row.id);
                        else next.add(row.id);
                        return next;
                      });
                    }}
                    aria-label={`${row.title} 선택`}
                  />
                </td>
                <td className="px-2 py-2">
                  <Link
                    href={`${TRADE_PROTOTYPE_BASE}/listings/${encodeURIComponent(row.id)}`}
                    prefetch={false}
                    className="flex min-w-0 items-center gap-2 hover:underline"
                  >
                    <span className="inline-flex h-10 w-10 shrink-0 rounded-ui-rect bg-sam-surface-muted" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-sam-fg">{row.title}</span>
                      <span className="font-mono sam-text-xxs text-sam-muted">{row.shortId}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-2 py-2">
                  <span className="block truncate">{row.sellerName}</span>
                  <span className="font-mono sam-text-xxs text-sam-muted">@{row.sellerHandle}</span>
                </td>
                <td className="px-2 py-2">
                  <span className="block truncate">{row.subject}</span>
                  <span className="truncate sam-text-xxs text-sam-muted">{row.categoryPath}</span>
                </td>
                <td className="px-2 py-2 tabular-nums">{row.price}</td>
                <td className="truncate px-2 py-2">{row.region}</td>
                <td className="px-2 py-2">
                  <TradeStatusBadge status={row.status} />
                </td>
                <td className="px-2 py-2 text-center tabular-nums">{row.likes ?? "—"}</td>
                <td className="px-2 py-2 text-center tabular-nums">{row.chats ?? "—"}</td>
                <td className="px-2 py-2 text-center tabular-nums">{row.reports ?? "—"}</td>
                <td className="px-2 py-2">
                  <TradePromoBadge active={row.promoted} />
                </td>
                <td className="whitespace-nowrap px-2 py-2">{row.registeredAt}</td>
                <td className="relative px-2 py-2 text-center">
                  <button
                    type="button"
                    className="rounded-ui-rect px-2 py-1 hover:bg-sam-surface-muted"
                    aria-label={`${row.title} 관리`}
                    onClick={() => setMenuOpenId((id) => (id === row.id ? null : row.id))}
                  >
                    ⋯
                  </button>
                  {menuOpenId === row.id ? <RowMenuMock /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sam-border px-3 py-2">
          <p className="sam-text-xxs text-sam-muted">
            전체 {MOCK_TOTAL_LISTINGS} · 표시 {rangeStart}–{rangeEnd} · 페이지당 {pageSize}
          </p>
          <div className="flex items-center gap-1">
            <ProtoButton variant="ghost" size="sm" disabled>
              이전
            </ProtoButton>
            <span className="rounded-ui-rect bg-signature/15 px-2 py-1 sam-text-xxs font-medium text-signature">
              {page}
            </span>
            <ProtoButton variant="ghost" size="sm">
              다음
            </ProtoButton>
          </div>
        </div>
      </div>
    </div>
  );
}
