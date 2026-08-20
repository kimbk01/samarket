"use client";

import { useState } from "react";
import { ProtoButton, SectionHeader } from "./trade-prototype-ui";

/** Audit: 6 ROOT subjects. Child rows not proven in production screenshot. */
const REAL_ROOTS = [
  { id: "trade", label: "중고거래", slug: "trade" },
  { id: "vehicle", label: "중고차", slug: "vehicle" },
  { id: "property", label: "부동산", slug: "property" },
  { id: "exchange", label: "환전거래", slug: "current" },
  { id: "jobs", label: "일자리", slug: "hiring" },
  { id: "rent-car", label: "렌터카", slug: "rent-car" },
] as const;

export function TradePrototypeTaxonomyPage() {
  const [selectedId, setSelectedId] = useState<(typeof REAL_ROOTS)[number]["id"]>("vehicle");
  const selected = REAL_ROOTS.find((r) => r.id === selectedId) ?? REAL_ROOTS[1];

  return (
    <div className="space-y-3">
      <SectionHeader
        title="분류 관리"
        description="주제(ROOT) · 카테고리(CHILD) · 토픽(검색 graph). DB child가 없으면 생성하지 않음."
        actions={<ProtoButton variant="primary">주제 추가</ProtoButton>}
      />

      <div className="grid min-h-[480px] grid-cols-12 gap-3">
        <div className="col-span-12 rounded-ui-rect border border-sam-border bg-sam-surface lg:col-span-4">
          <div className="border-b border-sam-border px-3 py-2">
            <p className="sam-text-body font-semibold">실제 taxonomy</p>
            <p className="sam-text-xxs text-sam-muted">감사 기준 ROOT 6 · child 없음</p>
          </div>
          <div className="p-2">
            {REAL_ROOTS.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setSelectedId(n.id)}
                className={[
                  "flex w-full items-start rounded-ui-rect px-2 py-1.5 text-left sam-text-body-secondary",
                  selectedId === n.id ? "bg-signature/15 font-medium text-signature" : "hover:bg-sam-surface-muted",
                ].join(" ")}
              >
                <span className="min-w-0">
                  <span className="block">{n.label}</span>
                  <span className="block font-normal sam-text-xxs text-sam-muted">child 없음</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-12 rounded-ui-rect border border-sam-border bg-sam-surface lg:col-span-8">
          <div className="border-b border-sam-border px-3 py-2">
            <h2 className="sam-text-body font-semibold">{selected.label}</h2>
            <p className="sam-text-xxs text-sam-muted">
              유형 ROOT · slug {selected.slug} · option owner = ROOT
            </p>
          </div>
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            <fieldset className="space-y-2 sam-text-body-secondary">
              <legend className="sam-text-xxs font-semibold text-sam-muted">기본</legend>
              <label className="block">
                <span className="sam-text-xxs text-sam-muted">이름</span>
                <input className="sam-input mt-0.5 w-full" defaultValue={selected.label} key={selected.id} />
              </label>
              <label className="block">
                <span className="sam-text-xxs text-sam-muted">slug</span>
                <input className="sam-input mt-0.5 w-full" defaultValue={selected.slug} key={`${selected.id}-slug`} />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" defaultChecked /> 홈 칩 노출
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" defaultChecked /> 글쓰기 런처
              </label>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="sam-text-xxs font-semibold text-sam-muted">카테고리 (CHILD) / 토픽</legend>
              <p className="rounded-ui-rect border border-sam-border-soft px-3 py-6 text-center sam-text-body-secondary text-sam-muted">
                child 없음
              </p>
              <ProtoButton variant="secondary" size="sm">
                카테고리 추가
              </ProtoButton>
            </fieldset>

            <fieldset className="space-y-2 lg:col-span-2" id="composition">
              <legend className="sam-text-xxs font-semibold text-sam-muted">
                옵션 / Composition · ROOT field_composition
              </legend>
              <div className="grid gap-2 sm:grid-cols-4 sam-text-body-secondary">
                {["제조사", "모델", "연식", "주행거리", "연료", "변속기"].map((f) => (
                  <label
                    key={f}
                    className="flex items-center gap-2 rounded-ui-rect border border-sam-border-soft px-2 py-1.5"
                  >
                    <input type="checkbox" defaultChecked={selected.id === "vehicle" && (f === "제조사" || f === "모델")} />
                    {f}
                  </label>
                ))}
              </div>
              <p className="sam-text-xxs text-sam-muted">
                CHILD field_composition은 option authority가 아님 (CUT A).
              </p>
            </fieldset>
          </div>
          <div className="border-t border-sam-border px-4 py-3">
            <ProtoButton variant="primary">저장</ProtoButton>
          </div>
        </div>
      </div>

      <section className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface-muted/40 p-3">
        <p className="sam-text-xxs font-semibold uppercase tracking-wide text-sam-muted">MOCK PREVIEW</p>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">
          child가 생겼을 때의 계층 표시 예시. 실제 DB 데이터가 아님.
        </p>
        <pre className="mt-2 overflow-x-auto font-mono sam-text-xxs text-sam-fg">{`중고차
 ├─ Toyota
 │   ├─ Vios
 │   └─ Fortuner
 └─ Honda`}</pre>
      </section>
    </div>
  );
}
