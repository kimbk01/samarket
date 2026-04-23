"use client";

import { useState } from "react";

export type HiddenPostFeedbackReason =
  | "bought_elsewhere"
  | "not_interested"
  | "offensive";

interface HiddenPostCardProps {
  postId: string;
  onUndo: () => void;
  onFeedback?: (reason: HiddenPostFeedbackReason) => void;
}

function IconUndo({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  );
}

function IconShoppingBag({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  );
}

function IconThumbsDown({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .967-.14 1.298-.38l.637-.925a2 2 0 011.733-.95H21M14 15h-3" />
    </svg>
  );
}

function IconSad({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export function HiddenPostCard({ postId, onUndo, onFeedback }: HiddenPostCardProps) {
  const [feedbackSent, setFeedbackSent] = useState(false);

  const handleFeedback = (reason: HiddenPostFeedbackReason) => {
    onFeedback?.(reason);
    setFeedbackSent(true);
  };

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface-muted p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[12px] font-semibold text-sam-fg">글을 숨겼어요</p>
          <p className="mt-0.5 text-[13px] text-sam-muted">이유를 알려주세요.</p>
        </div>
        <button
          type="button"
          onClick={onUndo}
          className="flex shrink-0 items-center gap-1 rounded-ui-rect px-2 py-1.5 text-[13px] font-medium text-sam-fg hover:bg-sam-border-soft"
        >
          <IconUndo className="h-4 w-4" />
          되돌리기
        </button>
      </div>

      {!feedbackSent ? (
        <ul className="mt-3 border-t border-sam-border">
          <li>
            <button
              type="button"
              onClick={() => handleFeedback("bought_elsewhere")}
              className="flex w-full items-center gap-3 border-b border-sam-border py-3 text-left text-[14px] text-sam-fg hover:bg-sam-border-soft/50"
            >
              <IconShoppingBag className="h-5 w-5 shrink-0 text-sam-muted" />
              이미 다른 물품을 구매했어요
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => handleFeedback("not_interested")}
              className="flex w-full items-center gap-3 border-b border-sam-border py-3 text-left text-[14px] text-sam-fg hover:bg-sam-border-soft/50"
            >
              <IconThumbsDown className="h-5 w-5 shrink-0 text-sam-muted" />
              이 물품에 관심없어요
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => handleFeedback("offensive")}
              className="flex w-full items-center gap-3 py-3 text-left text-[14px] text-sam-fg hover:bg-sam-border-soft/50"
            >
              <IconSad className="h-5 w-5 shrink-0 text-sam-muted" />
              이 글이 불쾌해요
            </button>
          </li>
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-sam-muted">의견을 남겨주셔서 감사해요.</p>
      )}
    </div>
  );
}
