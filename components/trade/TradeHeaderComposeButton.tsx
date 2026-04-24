"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { WriteLauncher } from "@/components/write-launcher/WriteLauncher";
import { useWriteCategory } from "@/contexts/WriteCategoryContext";
import { TRADE_CHAT_MESSENGER_LIST_HREF } from "@/lib/chats/surfaces/trade-chat-surface";

const CATEGORY_PREFIXES = ["/market/", "/community/", "/philife/", "/services/", "/features/"];

function getCategorySlugFromPath(pathname: string): string | null {
  for (const prefix of CATEGORY_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      const slug = pathname.slice(prefix.length).replace(/\/.*$/, "").trim();
      return slug || null;
    }
  }
  return null;
}

/**
 * 거래 1단 헤더용 `+` 버튼.
 * FAB와 동일하게: 카테고리 문맥이 있으면 바로 글쓰기, 없으면 런처를 연다.
 */
export function TradeHeaderComposeButton() {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [domReady, setDomReady] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const writeCtx = useWriteCategory();
  const writeCategorySlug = writeCtx?.writeCategorySlug ?? null;
  const pathSlug = useMemo(() => getCategorySlugFromPath(pathname ?? ""), [pathname]);
  const categorySlug = writeCategorySlug ?? pathSlug;

  useEffect(() => {
    setDomReady(true);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const updateMenuPos = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPos({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    updateMenuPos();
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updateMenuPos);
    window.addEventListener("scroll", updateMenuPos, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updateMenuPos);
      window.removeEventListener("scroll", updateMenuPos, true);
    };
  }, [menuOpen]);

  const openWrite = () => {
    setMenuOpen(false);
    if (categorySlug) {
      router.push(`/write/${encodeURIComponent(categorySlug)}`);
      return;
    }
    writeCtx?.ensureLauncherCategoriesLoaded();
    setLauncherOpen(true);
  };

  const openTradeChat = () => {
    setMenuOpen(false);
    router.push(TRADE_CHAT_MESSENGER_LIST_HREF);
  };

  const openTradeHistory = () => {
    setMenuOpen(false);
    router.push("/mypage/trade");
  };

  return (
    <>
      <div ref={menuRef} className="relative flex w-10 shrink-0 items-center justify-end">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          className="sam-header-action h-10 w-10 text-sam-fg"
          aria-label={t("nav_write_aria")}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <PlusIcon className="h-5 w-5" />
        </button>
      </div>
      {menuOpen && domReady && menuPos && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-[120] w-[11.5rem] overflow-hidden rounded-sam-lg border border-sam-border bg-sam-surface shadow-[0_14px_30px_rgba(0,0,0,0.18)]"
              style={{ top: menuPos.top, right: menuPos.right }}
            >
              <ActionRow icon={<WriteIcon className="h-5 w-5" />} label="글쓰기" onClick={openWrite} />
              <ActionRow icon={<ChatIcon className="h-5 w-5" />} label="거래 채팅" onClick={openTradeChat} />
              <ActionRow icon={<HistoryIcon className="h-5 w-5" />} label="거래 내역" onClick={openTradeHistory} />
            </div>,
            document.body
          )
        : null}
      {launcherOpen ? <WriteLauncher onClose={() => setLauncherOpen(false)} /> : null}
    </>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left sam-text-body font-medium text-sam-fg hover:bg-sam-surface-muted"
    >
      <span className="text-sam-fg">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function WriteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 113 3L12 14l-4 1 1-4 7.5-7.5z"
      />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 2m6-2a9 9 0 11-2.64-6.36M12 3a9 9 0 019 9"
      />
    </svg>
  );
}
