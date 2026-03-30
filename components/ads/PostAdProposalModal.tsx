"use client";

import { useState } from "react";
import { AdProductSelector } from "./AdProductSelector";
import { getUserPointBalance } from "@/lib/ads/mock-ad-data";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import Link from "next/link";

interface PostAdProposalModalProps {
  postId: string;
  postTitle: string;
  boardKey?: string;
  /** 광고 건너뛰기 → 게시글 상세로 이동 */
  onSkip: () => void;
}

/**
 * 글 등록 완료 직후 표시되는 광고 제안 모달
 * - 상품 선택 → 포인트 차감 → 광고 신청 → 관리자 승인 대기
 */
export function PostAdProposalModal({
  postId,
  postTitle,
  boardKey = "plife",
  onSkip,
}: PostAdProposalModalProps) {
  const me = getCurrentUser();
  const [step, setStep] = useState<"propose" | "select" | "done">("propose");
  const [adId, setAdId] = useState<string>("");

  const balance = me?.id ? getUserPointBalance(me.id) : 0;

  if (step === "done") {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
        <div className="w-full max-w-lg rounded-t-3xl bg-white px-5 pb-12 pt-6 shadow-2xl">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <span className="text-[32px]">✅</span>
            </div>
            <h2 className="text-[18px] font-bold text-gray-900">광고 신청 완료!</h2>
            <p className="text-[13px] text-gray-600">
              관리자 검토 후 승인되면 피드 상단에 노출됩니다.
              <br />
              신청 내역은 마이페이지 &gt; 광고 관리에서 확인할 수 있어요.
            </p>
            <button
              type="button"
              onClick={onSkip}
              className="mt-4 w-full rounded-2xl bg-gray-900 py-3.5 text-[15px] font-bold text-white"
            >
              게시글 보기
            </button>
            <Link
              href="/my/ads"
              className="text-[13px] text-sky-700 underline"
            >
              광고 관리 페이지 바로가기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (step === "select") {
    return (
      <AdProductSelector
        boardKey={boardKey}
        postId={postId}
        postTitle={postTitle}
        userPointBalance={balance}
        onClose={() => setStep("propose")}
        onSuccess={(id) => {
          setAdId(id);
          setStep("done");
        }}
      />
    );
  }

  // step === "propose"
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-t-3xl bg-white px-5 pb-10 pt-5 shadow-2xl">
        {/* 헤더 */}
        <div className="mb-1 flex items-center justify-between">
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
            광고
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="text-[13px] text-gray-400 hover:text-gray-600"
          >
            건너뛰기
          </button>
        </div>

        <div className="mt-3 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
            <span className="text-[28px]">📢</span>
          </div>
          <h2 className="text-[18px] font-bold text-gray-900">이 글을 광고로 노출할까요?</h2>
          <p className="mt-2 text-[13px] text-gray-500">
            포인트를 사용해 커뮤니티 피드 상단에 내 글을 노출시켜 보세요.
            <br />더 많은 이웃이 볼 수 있어요.
          </p>
        </div>

        {/* 포인트 잔액 */}
        <div className="mt-4 flex items-center justify-between rounded-xl bg-sky-50 px-3 py-2.5">
          <span className="text-[13px] text-sky-700">내 포인트 잔액</span>
          <span className="text-[16px] font-bold text-sky-800">{balance.toLocaleString()}P</span>
        </div>

        {/* 간단 상품 미리보기 */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            { label: "상단고정 3일", point: "10,000P" },
            { label: "상단고정 7일", point: "20,000P" },
          ].map(({ label, point }) => (
            <div
              key={label}
              className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-center"
            >
              <p className="text-[12px] font-medium text-gray-800">{label}</p>
              <p className="text-[13px] font-bold text-sky-700">{point}</p>
            </div>
          ))}
        </div>

        {/* 액션 버튼 */}
        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={() => setStep("select")}
            className="w-full rounded-2xl bg-amber-500 py-3.5 text-[15px] font-bold text-white shadow-md hover:bg-amber-600"
          >
            광고 상품 선택하기
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="w-full rounded-2xl border border-gray-200 bg-white py-3 text-[14px] font-medium text-gray-600 hover:bg-gray-50"
          >
            나중에 할게요
          </button>
        </div>
      </div>
    </div>
  );
}
