"use client";

import { useState } from "react";

/**
 * 사용자의 판매중 상품 목록 지역을 새 지역으로 일괄 업데이트.
 * TODO: products 테이블 구조 확정 후 연동. 현재는 확인 모달 + 시그니처만.
 */
export function BulkRegionChangeContent() {
  const [confirming, setConfirming] = useState(false);

  const handleSubmit = () => {
    setConfirming(true);
  };

  const handleConfirm = () => {
    // TODO: fetch user's selling products, batch update region_id. Supabase 연동.
    setConfirming(false);
    alert("준비 중입니다. products 테이블 연동 후 동작합니다.");
  };

  return (
    <div className="space-y-4">
      <p className="text-[14px] text-gray-600">
        등록한 판매 글의 동네를 한 번에 변경합니다.
      </p>
      {!confirming ? (
        <button
          type="button"
          onClick={handleSubmit}
          className="rounded-lg bg-signature px-4 py-2 text-[14px] font-medium text-white"
        >
          동네 일괄 변경
        </button>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-[14px] text-gray-700">정말 일괄 변경하시겠습니까?</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded border border-gray-300 px-3 py-1.5 text-[14px] text-gray-700"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded bg-signature px-3 py-1.5 text-[14px] font-medium text-white"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
