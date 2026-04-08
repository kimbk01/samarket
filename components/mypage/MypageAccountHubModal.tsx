"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAccountHubModalLinks } from "@/lib/my/managed-my-section-ctas";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function MypageAccountHubModal({ open, onClose }: Props) {
  const router = useRouter();
  const links = getAccountHubModalLinks();

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  function go(href: string) {
    if (href === "/mypage") {
      onClose();
      return;
    }
    onClose();
    router.push(href);
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mypage-account-hub-title"
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label="닫기" onClick={onClose} />
      <div
        className="relative z-[1] flex max-h-[min(92dvh,720px)] w-full max-w-lg flex-col rounded-t-2xl border border-ig-border bg-[var(--sub-bg)] shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-ig-border px-4 py-3">
          <h2 id="mypage-account-hub-title" className="text-[17px] font-semibold text-foreground">
            빠른 이동
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-ig-highlight"
            aria-label="닫기"
          >
            <span className="text-[22px] leading-none">×</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-wrap gap-2">
            {links.map((item) => {
              const isLogout = item.href === "/my/logout";
              if (isLogout) {
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-red-200 bg-background px-3 py-2 text-[13px] font-semibold text-red-600 active:opacity-80 dark:border-red-900/60"
                  >
                    {item.label}
                  </Link>
                );
              }
              return (
                <button
                  key={item.href + item.label}
                  type="button"
                  onClick={() => go(item.href)}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-ig-border bg-background px-3 py-2 text-[13px] font-medium text-foreground active:bg-ig-highlight"
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-center text-[12px] text-[var(--text-muted)]">
            항목을 누르면 이동하며 창이 닫힙니다.
          </p>
        </div>
      </div>
    </div>
  );
}
