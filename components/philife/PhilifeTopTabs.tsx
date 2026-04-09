"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { philifeAppPaths } from "@/lib/philife/paths";

/** `instagram` 은 예전 이름 — 하단 보더 탭(페이스북형) */
export type PhilifeTopTabsVariant = "pills" | "underline" | "instagram";

interface PhilifeTopTabsProps {
  variant?: PhilifeTopTabsVariant;
}

export function PhilifeTopTabs({ variant = "pills" }: PhilifeTopTabsProps) {
  const pathname = usePathname();
  const onCommunity = pathname === philifeAppPaths.home;
  const onChats = pathname === philifeAppPaths.chats;

  if (variant === "instagram" || variant === "underline") {
    const tab = (active: boolean) =>
      `flex-1 py-3 text-center text-[13px] font-semibold transition-colors ${
        active ? "border-b-2 border-signature text-signature" : "border-b-2 border-transparent text-muted"
      }`;
    return (
      <nav
        className="-mx-px mt-1 flex border-b border-ig-border bg-[var(--sub-bg)]"
        aria-label="커뮤니티 메뉴"
      >
        <Link
          href={philifeAppPaths.home}
          aria-current={onCommunity ? "page" : undefined}
          className={tab(onCommunity)}
        >
          피드
        </Link>
        <Link
          href={philifeAppPaths.chats}
          aria-current={onChats ? "page" : undefined}
          className={tab(onChats)}
        >
          메시지
        </Link>
      </nav>
    );
  }

  return (
    <nav className="mt-3 flex items-center gap-2 overflow-x-auto pb-1" aria-label="커뮤니티 메뉴">
      <Link
        href={philifeAppPaths.home}
        aria-current={onCommunity ? "page" : undefined}
        className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold ${
          onCommunity ? "bg-signature text-white" : "border border-ig-border bg-[var(--sub-bg)] text-foreground"
        }`}
      >
        커뮤니티
      </Link>
      <Link
        href={philifeAppPaths.chats}
        aria-current={onChats ? "page" : undefined}
        className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold ${
          onChats ? "bg-signature text-white" : "border border-ig-border bg-[var(--sub-bg)] text-foreground"
        }`}
      >
        채팅
      </Link>
    </nav>
  );
}
