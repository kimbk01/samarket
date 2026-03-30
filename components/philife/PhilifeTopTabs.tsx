"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { philifeAppPaths } from "@/lib/philife/paths";

export type PhilifeTopTabsVariant = "pills" | "instagram";

interface PhilifeTopTabsProps {
  variant?: PhilifeTopTabsVariant;
}

export function PhilifeTopTabs({ variant = "pills" }: PhilifeTopTabsProps) {
  const pathname = usePathname();
  const onCommunity = pathname === philifeAppPaths.home;
  const onChats = pathname === philifeAppPaths.chats;

  if (variant === "instagram") {
    const tab = (active: boolean) =>
      `flex-1 py-3 text-center text-[13px] font-semibold transition-colors ${
        active ? "border-b-2 border-gray-900 text-gray-900" : "border-b-2 border-transparent text-gray-400"
      }`;
    return (
      <nav
        className="-mx-px mt-1 flex border-b border-gray-100"
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
          onCommunity ? "bg-gray-900 text-white" : "border border-gray-200 bg-white text-gray-700"
        }`}
      >
        커뮤니티
      </Link>
      <Link
        href={philifeAppPaths.chats}
        aria-current={onChats ? "page" : undefined}
        className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold ${
          onChats ? "bg-gray-900 text-white" : "border border-gray-200 bg-white text-gray-700"
        }`}
      >
        채팅
      </Link>
    </nav>
  );
}
