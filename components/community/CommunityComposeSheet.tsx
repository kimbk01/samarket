"use client";

import Link from "next/link";
import { useEffect } from "react";
import { philifeAppPaths } from "@domain/philife/paths";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";

export function CommunityComposeSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
  /** @deprecated 글쓰기는 /philife/write 고정 */
  sectionSlug?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const writeHref = philifeAppPaths.write;
  const writeMeetingHref = philifeAppPaths.writeMeeting;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="닫기" onClick={onClose} />
      <div className="relative rounded-t-2xl bg-white px-4 pb-8 pt-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-200" />
        <p className="mb-3 text-center text-[13px] font-medium text-gray-500">무엇을 할까요?</p>
        <ul className="space-y-2">
          <li>
            <Link
              href={TRADE_CHAT_SURFACE.hubPath}
              onClick={onClose}
              className="flex items-center justify-center rounded-xl border border-gray-100 bg-gray-50 py-3.5 text-[15px] font-medium text-gray-900"
            >
              동네봇에게 질문 남기기
            </Link>
          </li>
          <li>
            <Link
              href={writeHref}
              onClick={onClose}
              className="flex items-center justify-center rounded-xl border border-gray-200 bg-white py-3.5 text-[15px] font-medium text-gray-900"
            >
              커뮤니티 글쓰기
            </Link>
          </li>
          <li>
            <Link
              href={writeMeetingHref}
              onClick={onClose}
              className="flex items-center justify-center rounded-xl bg-emerald-600 py-3.5 text-[15px] font-medium text-white"
            >
              오픈채팅 만들기
            </Link>
          </li>
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full py-2 text-[14px] text-gray-500"
        >
          취소
        </button>
      </div>
    </div>
  );
}
