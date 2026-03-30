"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminGlobalAlertSoundSection } from "@/components/admin/stores/AdminGlobalAlertSoundSection";
import {
  BROWSE_PRIMARY_INDUSTRIES,
  BROWSE_SUB_INDUSTRIES,
} from "@/lib/stores/browse-mock/mock-store-categories";
import {
  clearBrowseIndustryOverrides,
  getBrowseIndustryOverrides,
  persistBrowseIndustryOverrides,
  type BrowseIndustryOverridesPayload,
} from "@/lib/stores/browse-mock/browse-industry-merge";
import type { BrowsePrimaryIndustry, BrowseSubIndustry } from "@/lib/stores/browse-mock/types";
import { invalidateStoreDeliveryAlertSoundCache } from "@/lib/business/store-order-alert-sound";
import { bustOrderMatchAlertSoundCache } from "@/lib/notifications/play-order-match-alert";

function nextPrimarySortOrder(merged: BrowsePrimaryIndustry[]): number {
  const max = merged.reduce((m, p) => Math.max(m, p.sortOrder), 0);
  return max + 10;
}

function nextSubSortOrderFor(
  primarySlug: string,
  p: BrowseIndustryOverridesPayload
): number {
  const slug = primarySlug.trim();
  const base = BROWSE_SUB_INDUSTRIES.filter((s) => s.primarySlug === slug);
  const extra = p.addedSubs.filter((s) => s.primarySlug === slug);
  const max = [...base, ...extra].reduce((m, s) => Math.max(m, s.sortOrder), 0);
  return max + 10;
}

function slugifyLoose(raw: string): string {
  const t = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return t.replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function uniquePrimarySlug(candidate: string, taken: Set<string>): string {
  if (candidate && !taken.has(candidate)) return candidate;
  return `p-${Date.now().toString(36)}`;
}

function uniqueSubSlug(candidate: string, taken: Set<string>): string {
  if (candidate && !taken.has(candidate)) return candidate;
  return `s-${Date.now().toString(36)}`;
}

export function AdminStoreApplicationSettingsPage() {
  const [payload, setPayload] = useState<BrowseIndustryOverridesPayload>({
    addedPrimaries: [],
    addedSubs: [],
  });
  const [primaryName, setPrimaryName] = useState("");
  const [primarySymbol, setPrimarySymbol] = useState("📦");
  const [primarySlugInput, setPrimarySlugInput] = useState("");
  const [subPrimarySlug, setSubPrimarySlug] = useState("");
  const [subName, setSubName] = useState("");
  const [subSlugInput, setSubSlugInput] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const o = getBrowseIndustryOverrides();
    setPayload(o);
    const merged = [...BROWSE_PRIMARY_INDUSTRIES, ...o.addedPrimaries].sort(
      (a, b) => a.sortOrder - b.sortOrder
    );
    setSubPrimarySlug((prev) => prev || merged[0]?.slug || "");
  }, []);

  const commit = useCallback((next: BrowseIndustryOverridesPayload) => {
    setPayload(next);
    persistBrowseIndustryOverrides(next);
    setMsg("저장했습니다. 매장 신청·둘러보기 화면을 새로고침하면 반영됩니다.");
    window.setTimeout(() => setMsg(null), 4000);
  }, []);

  const mergedPrimaries = useMemo(
    () => [...BROWSE_PRIMARY_INDUSTRIES, ...payload.addedPrimaries].sort(
      (a, b) => a.sortOrder - b.sortOrder
    ),
    [payload.addedPrimaries]
  );

  const addPrimary = () => {
    const nameKo = primaryName.trim();
    if (!nameKo) return;
    const taken = new Set(mergedPrimaries.map((p) => p.slug));
    const fromInput = slugifyLoose(primarySlugInput);
    const slug = uniquePrimarySlug(fromInput || slugifyLoose(nameKo), taken);
    const id = `add-p-${Date.now().toString(36)}`;
    const row: BrowsePrimaryIndustry = {
      id,
      slug,
      nameKo,
      sortOrder: nextPrimarySortOrder(mergedPrimaries),
      symbol: primarySymbol.trim() || "📦",
    };
    commit({
      ...payload,
      addedPrimaries: [...payload.addedPrimaries, row],
    });
    setPrimaryName("");
    setPrimarySlugInput("");
    setSubPrimarySlug(slug);
  };

  const removeAddedPrimary = (id: string) => {
    const p = payload.addedPrimaries.find((x) => x.id === id);
    if (!p) return;
    const nextSubs = payload.addedSubs.filter((s) => s.primarySlug !== p.slug);
    commit({
      addedPrimaries: payload.addedPrimaries.filter((x) => x.id !== id),
      addedSubs: nextSubs,
    });
  };

  const addSub = () => {
    const nameKo = subName.trim();
    const pslug = subPrimarySlug.trim();
    if (!nameKo || !pslug) return;
    const baseSubs = BROWSE_SUB_INDUSTRIES.filter((s) => s.primarySlug === pslug);
    const extraSubs = payload.addedSubs.filter((s) => s.primarySlug === pslug);
    const subs = [...baseSubs, ...extraSubs];
    const taken = new Set(subs.map((s) => s.slug));
    const fromInput = slugifyLoose(subSlugInput);
    const slug = uniqueSubSlug(fromInput || slugifyLoose(nameKo), taken);
    const row: BrowseSubIndustry = {
      id: `add-s-${Date.now().toString(36)}`,
      slug,
      nameKo,
      primarySlug: pslug,
      sortOrder: nextSubSortOrderFor(pslug, payload),
    };
    commit({
      ...payload,
      addedSubs: [...payload.addedSubs, row],
    });
    setSubName("");
    setSubSlugInput("");
  };

  const removeAddedSub = (id: string) => {
    commit({
      ...payload,
      addedSubs: payload.addedSubs.filter((s) => s.id !== id),
    });
  };

  const resetOverrides = () => {
    if (!window.confirm("추가한 업종만 삭제합니다. 계속할까요?")) return;
    clearBrowseIndustryOverrides();
    setPayload(getBrowseIndustryOverrides());
    setMsg("추가 업종을 비웠습니다.");
    window.setTimeout(() => setMsg(null), 4000);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <AdminPageHeader
        title="매장 설정 (매장 신청 연동)"
        description="매장 신청 폼과 매장 둘러보기에 쓰는 1·2차 업종을 관리합니다. 추가분은 이 브라우저 localStorage에만 저장됩니다."
      />

      <AdminGlobalAlertSoundSection
        title="매장 알림음 (배달 신규 주문)"
        description={
          <>
            아래에서 <strong className="text-gray-700">프리셋을 고르거나</strong>,{" "}
            <strong className="text-gray-700">내 PC에서 오디오 파일을 업로드</strong>하면 전역 기본 알림으로
            저장됩니다. (매장별로는 &quot;매장 설정&quot; 프로필에서 따로 지정 가능)
          </>
        }
        codeKey="admin_settings.store_delivery_alert_sound"
        apiPath="/api/admin/store-delivery-alert-sound"
        onAfterMutation={invalidateStoreDeliveryAlertSoundCache}
      />

      <AdminGlobalAlertSoundSection
        title="배달채팅 알림음 (일치 확인)"
        description={
          <>
            구매자가 「주문 내용이 일치합니다」를 보낼 때{" "}
            <strong className="text-gray-700">입점 측</strong> 배달채팅에서 재생되는 소리입니다. 프리셋·PC
            업로드·미리듣기는 위 배달 알림음과 동일합니다.
          </>
        }
        codeKey="admin_settings.order_match_chat_alert_sound"
        apiPath="/api/admin/order-match-chat-alert-sound"
        onAfterMutation={bustOrderMatchAlertSoundCache}
      />

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-[15px] font-semibold text-gray-900">연동 여부</h2>
        <ul className="mt-3 space-y-2 text-[13px] text-gray-700">
          <li className="flex flex-wrap items-center gap-2">
            <span className="text-green-600">✓</span>
            <span>매장 신청</span>
            <Link href="/my/business/apply" className="text-signature underline">
              /my/business/apply
            </Link>
            <span className="text-gray-500">
              — 1차·2차 업종 각각 선택, 슬러그는 아래 병합 목록과 동일. DB에 같은 slug 행이 있으면 신청 시
              연결되어 승인 후 /stores/browse 에 노출됩니다.
            </span>
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <span className="text-green-600">✓</span>
            <span>매장 둘러보기</span>
            <Link href="/stores" className="text-signature underline">
              /stores
            </Link>
            <span className="text-gray-500">
              — 1·2차 업종·링크 슬러그 동일 소스(
              <code className="rounded bg-gray-100 px-1">/stores/browse/[primary]/[sub]</code>)
            </span>
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <span className="text-amber-600">△</span>
            <span>매장 심사(DB)</span>
            <Link href="/admin/stores" className="text-signature underline">
              /admin/stores
            </Link>
            <span className="text-gray-500">— 별도 DB 흐름; 이 화면의 목록과 자동 동기화되지 않음</span>
          </li>
        </ul>
        <p className="mt-2 text-[12px] text-gray-500">
          저장 키: <code className="rounded bg-gray-100 px-1">kasama-browse-industry-overrides-v1</code>
        </p>
      </section>

      {msg && (
        <p className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-[13px] text-green-800">
          {msg}
        </p>
      )}

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-[15px] font-semibold text-gray-900">기본 1차 업종 (코드)</h2>
        <p className="mt-1 text-[12px] text-gray-500">배포 시 포함된 목록입니다. 여기서는 읽기만 됩니다.</p>
        <ul className="mt-3 divide-y divide-gray-100 text-[13px]">
          {BROWSE_PRIMARY_INDUSTRIES.sort((a, b) => a.sortOrder - b.sortOrder).map((p) => (
            <li key={p.id} className="flex flex-wrap gap-2 py-2">
              <span aria-hidden>{p.symbol}</span>
              <span className="font-medium">{p.nameKo}</span>
              <span className="text-gray-500">slug: {p.slug}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-[15px] font-semibold text-gray-900">추가 1차 업종</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex min-w-[140px] flex-1 flex-col text-[12px] text-gray-600">
            이름
            <input
              value={primaryName}
              onChange={(e) => setPrimaryName(e.target.value)}
              className="mt-0.5 rounded border border-gray-200 px-2 py-1.5 text-[14px] text-gray-900"
              placeholder="예: 약국"
            />
          </label>
          <label className="flex w-24 flex-col text-[12px] text-gray-600">
            심볼
            <input
              value={primarySymbol}
              onChange={(e) => setPrimarySymbol(e.target.value)}
              className="mt-0.5 rounded border border-gray-200 px-2 py-1.5 text-[14px]"
              placeholder="📦"
            />
          </label>
          <label className="flex min-w-[160px] flex-1 flex-col text-[12px] text-gray-600">
            슬러그 (선택, 영문·숫자)
            <input
              value={primarySlugInput}
              onChange={(e) => setPrimarySlugInput(e.target.value)}
              className="mt-0.5 rounded border border-gray-200 px-2 py-1.5 text-[14px] text-gray-900"
              placeholder="비우면 자동"
            />
          </label>
          <button
            type="button"
            onClick={addPrimary}
            className="rounded-lg bg-signature px-4 py-2 text-[13px] font-medium text-white"
          >
            추가
          </button>
        </div>
        {payload.addedPrimaries.length === 0 ? (
          <p className="mt-3 text-[13px] text-gray-500">추가된 1차 업종이 없습니다.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 text-[13px]">
            {payload.addedPrimaries.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span aria-hidden>{p.symbol}</span> {p.nameKo}{" "}
                  <span className="text-gray-500">({p.slug})</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeAddedPrimary(p.id)}
                  className="text-[12px] text-red-600 underline"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-[15px] font-semibold text-gray-900">2차 업종</h2>
        <p className="mt-1 text-[12px] text-gray-500">
          1차 슬러그를 고른 뒤 하위 업종을 추가합니다. 기본 하위는 코드에 고정입니다.
        </p>
        <label className="mt-3 block text-[12px] text-gray-600">
          1차 (병합 목록)
          <select
            value={subPrimarySlug}
            onChange={(e) => setSubPrimarySlug(e.target.value)}
            className="mt-0.5 w-full max-w-md rounded border border-gray-200 px-2 py-1.5 text-[14px] text-gray-900"
          >
            {mergedPrimaries.map((p) => (
              <option key={p.id} value={p.slug}>
                {p.symbol} {p.nameKo} ({p.slug})
              </option>
            ))}
          </select>
        </label>
        {subPrimarySlug ? (
          <>
            <p className="mt-3 text-[13px] font-medium text-gray-800">기본 하위 (코드)</p>
            <ul className="mt-1 space-y-1 text-[12px] text-gray-600">
              {BROWSE_SUB_INDUSTRIES.filter((s) => s.primarySlug === subPrimarySlug)
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((s) => (
                  <li key={s.id}>
                    {s.nameKo} <span className="text-gray-400">({s.slug})</span>
                  </li>
                ))}
            </ul>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="flex min-w-[140px] flex-1 flex-col text-[12px] text-gray-600">
                추가 하위 이름
                <input
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  className="mt-0.5 rounded border border-gray-200 px-2 py-1.5 text-[14px] text-gray-900"
                  placeholder="예: 한의원"
                />
              </label>
              <label className="flex min-w-[160px] flex-1 flex-col text-[12px] text-gray-600">
                슬러그 (선택)
                <input
                  value={subSlugInput}
                  onChange={(e) => setSubSlugInput(e.target.value)}
                  className="mt-0.5 rounded border border-gray-200 px-2 py-1.5 text-[14px] text-gray-900"
                  placeholder="비우면 자동"
                />
              </label>
              <button
                type="button"
                onClick={addSub}
                className="rounded-lg bg-signature px-4 py-2 text-[13px] font-medium text-white"
              >
                하위 추가
              </button>
            </div>
            <p className="mt-3 text-[13px] font-medium text-gray-800">추가된 하위만</p>
            {payload.addedSubs.filter((s) => s.primarySlug === subPrimarySlug).length === 0 ? (
              <p className="text-[12px] text-gray-500">없음</p>
            ) : (
              <ul className="mt-1 divide-y divide-gray-100 text-[13px]">
                {payload.addedSubs
                  .filter((s) => s.primarySlug === subPrimarySlug)
                  .map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                      <span>
                        {s.nameKo} <span className="text-gray-500">({s.slug})</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAddedSub(s.id)}
                        className="text-[12px] text-red-600 underline"
                      >
                        삭제
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </>
        ) : null}
      </section>

      <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50/80 p-4">
        <h2 className="text-[14px] font-semibold text-gray-900">초기화</h2>
        <p className="mt-1 text-[12px] text-gray-600">
          추가 1·2차 업종만 삭제합니다. 코드에 있는 기본 업종은 그대로입니다.
        </p>
        <button
          type="button"
          onClick={resetOverrides}
          className="mt-3 rounded-lg border border-amber-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-800"
        >
          추가 업종 전부 제거
        </button>
      </section>

    </div>
  );
}
