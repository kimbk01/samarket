"use client";

import { useState } from "react";
import { AdProductSelector } from "./AdProductSelector";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { useUserPointBalance } from "@/hooks/useUserPointBalance";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

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
  const { t } = useI18n();
  const me = getCurrentUser();
  const [step, setStep] = useState<"propose" | "select" | "done">("propose");

  const { balance } = useUserPointBalance(me?.id);

  if (step === "done") {
    return (
      <DibayBottomSheet open onClose={onSkip} title={t("ui_ad_apply_complete_title")} anchor="above-bottom-nav">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className={OverlayUi.bodySecondary}>
            관리자 검토 후 승인되면 피드 상단에 노출됩니다.
            <br />
            신청 내역은 마이페이지 &gt; 광고 관리에서 확인할 수 있어요.
          </p>
          <div className={`${OverlayUi.actionsStack} mt-4 w-full`}>
            <DibayOverlayButton roleTone="primary" onClick={onSkip}>
              게시글 보기
            </DibayOverlayButton>
            <Link href="/mypage/ads" className={`${OverlayUi.btn.text} text-center`}>
              광고 관리 페이지 바로가기
            </Link>
          </div>
        </div>
      </DibayBottomSheet>
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
        onSuccess={() => {
          setStep("done");
        }}
      />
    );
  }

  return (
    <DibayBottomSheet
      open
      onClose={onSkip}
      title={t("ui_ad_promote_confirm_title")}
      anchor="above-bottom-nav"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
          광고
        </span>
        <button type="button" onClick={onSkip} className={OverlayUi.btn.text}>
          건너뛰기
        </button>
      </div>

      <p className={`mt-2 text-center ${OverlayUi.bodySecondary}`}>
        포인트를 사용해 커뮤니티 피드 상단에 내 글을 노출시켜 보세요.
        <br />더 많은 이웃이 볼 수 있어요.
      </p>

      <div className="mt-4 flex items-center justify-between rounded-[length:var(--overlay-radius-md)] bg-sky-50 px-3 py-2.5">
        <span className="text-sm text-sky-700">{t("ui_ad_my_points_balance")}</span>
        <span className="text-base font-bold text-sky-800">{balance.toLocaleString()}P</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {[
          { label: "상단고정 3일", point: "10,000P" },
          { label: "상단고정 7일", point: "20,000P" },
        ].map(({ label, point }) => (
          <div
            key={label}
            className="rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] px-3 py-2 text-center"
          >
            <p className={`font-medium text-[color:var(--overlay-text-primary)] ${OverlayUi.caption}`}>{label}</p>
            <p className="text-sm font-bold text-sky-700">{point}</p>
          </div>
        ))}
      </div>

      <div className={`${OverlayUi.actionsStack} mt-5`}>
        <DibayOverlayButton roleTone="primary" onClick={() => setStep("select")}>
          광고 상품 선택하기
        </DibayOverlayButton>
        <DibayOverlayButton roleTone="secondary" onClick={onSkip}>
          나중에 할게요
        </DibayOverlayButton>
      </div>
    </DibayBottomSheet>
  );
}
