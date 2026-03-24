"use client";

import {
  MANUAL_DURING_TEST,
  BEFORE_PRODUCTION,
  type MemoItem,
} from "@/lib/admin/production-memo";

function MemoList({
  items,
  sectionLabel,
}: {
  items: MemoItem[];
  sectionLabel: string;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-3 text-[15px] font-medium text-gray-800">
        {sectionLabel}
      </h2>
      {items.length === 0 ? (
        <p className="text-[14px] text-gray-500">등록된 항목이 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className={`flex items-start gap-3 text-[14px] ${
                item.applied ? "text-gray-500" : "text-gray-800"
              }`}
            >
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-300 bg-white"
                aria-hidden
              >
                {item.applied ? (
                  <span className="text-signature">✓</span>
                ) : (
                  <span className="text-gray-300">□</span>
                )}
              </span>
              <span className={item.applied ? "line-through" : ""}>
                [{item.id}] {item.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * 관리자 메모: 테스트 기간 수동 적용 항목 / 실서비스 전 처리 목록
 * - 체크(적용 완료) 반영은 production-memo.ts에서 applied: true 로 설정.
 * - 적용 요청: 대화에서 "N번 적용해줘"라고 하면 코드 반영 후 해당 항목을 applied 로 표시해 줌.
 */
export default function AdminMemoPage() {
  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">실서비스 메모</h1>
        <p className="mt-1 text-[13px] text-gray-500">
          테스트 기간 수동 적용 항목·실서비스 전 처리 목록. 적용 시 대화에서
          &quot;N번 적용해줘&quot; 요청하면 코드 반영 후 체크 표시해 드립니다.
        </p>
      </div>

      <MemoList
        items={MANUAL_DURING_TEST}
        sectionLabel="테스트 기간 중 임의로 수동 적용된 부분"
      />
      <MemoList
        items={BEFORE_PRODUCTION}
        sectionLabel="실서비스 전 처리해야 할 부분"
      />

      <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
        <p className="font-medium">적용 방법</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-700">
          <li>항목 추가·수정: <code className="rounded bg-amber-100 px-1">web/lib/admin/production-memo.ts</code> 편집</li>
          <li>적용 완료(체크): 대화에서 &quot;1번 적용해줘&quot; 등 요청 → 코드 반영 후 해당 항목에 <code>applied: true</code> 설정</li>
        </ul>
      </div>
    </div>
  );
}
