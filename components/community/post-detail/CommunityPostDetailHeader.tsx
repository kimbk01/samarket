"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellOff, MoreHorizontal, Share2 } from "lucide-react";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { philifeAppPaths } from "@domain/philife/paths";
import { COMMUNITY_DROPDOWN_PANEL_CLASS } from "@/lib/philife/philife-flat-ui-classes";

type ActionRefs = {
  onOpenReport: () => void;
  onDelete?: () => void;
  canDelete: boolean;
  canReport: boolean;
  postUrl: string;
};

function DetailHeaderRight({ r }: { r: React.MutableRefObject<ActionRefs> }) {
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  const onShare = useCallback(async () => {
    const url = r.current.postUrl || (typeof window !== "undefined" ? window.location.href : "");
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: document.title, url });
        return;
      }
    } catch {
      /* user cancel or share failed */
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  }, [r]);

  return (
    <div className="flex items-center gap-0.5 pr-0.5">
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-[4px] text-[#1F2430] active:bg-[#F7F8FA]"
        aria-label="이 글 알림 끄기(준비 중)"
        title="알림"
      >
        <BellOff className="h-5 w-5" strokeWidth={1.8} />
      </button>
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-[4px] text-[#1F2430] active:bg-[#F7F8FA]"
        onClick={() => void onShare()}
        aria-label="공유"
      >
        <Share2 className="h-5 w-5" strokeWidth={1.8} />
      </button>
      <div className="relative">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-[4px] text-[#1F2430] active:bg-[#F7F8FA]"
          aria-label="더보기"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <MoreHorizontal className="h-5 w-5" strokeWidth={1.8} />
        </button>
        {moreOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default"
              aria-label="닫기"
              onClick={() => setMoreOpen((prev) => (prev ? false : prev))}
            />
            <ul
              className={`absolute right-0 top-full z-50 mt-1 min-w-[9.5rem] text-left ${COMMUNITY_DROPDOWN_PANEL_CLASS}`}
              role="menu"
            >
              {r.current.canReport ? (
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-[14px] font-semibold text-[#1F2430] hover:bg-[#F7F8FA]"
                    onClick={() => {
                      setMoreOpen((prev) => (prev ? false : prev));
                      r.current.onOpenReport();
                    }}
                  >
                    신고
                  </button>
                </li>
              ) : null}
              {r.current.canDelete && r.current.onDelete ? (
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-[14px] font-semibold text-[#E25555] hover:bg-red-50"
                    onClick={() => {
                      setMoreOpen((prev) => (prev ? false : prev));
                      r.current.onDelete?.();
                    }}
                  >
                    삭제
                  </button>
                </li>
              ) : null}
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-2 text-left text-[14px] font-semibold text-[#1F2430] hover:bg-[#F7F8FA]"
                  onClick={() => {
                    setMoreOpen((prev) => (prev ? false : prev));
                    void router.push(philifeAppPaths.home);
                  }}
                >
                  목록으로
                </button>
              </li>
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}

type Props = {
  titleText: string;
  onOpenReport: () => void;
  onDelete?: () => void;
  canDelete: boolean;
  canReport: boolean;
  postUrl: string;
};

export function CommunityPostDetailHeader({
  titleText,
  onOpenReport,
  onDelete,
  canDelete,
  canReport,
  postUrl,
}: Props) {
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const r = useRef<ActionRefs>({ onOpenReport, onDelete, canDelete, canReport, postUrl });
  r.current = { onOpenReport, onDelete, canDelete, canReport, postUrl };

  const rightSlot = useMemo(() => <DetailHeaderRight r={r} />, []);

  useLayoutEffect(() => {
    if (!setMainTier1Extras) return;
    setMainTier1Extras({
      tier1: {
        titleText: titleText || "커뮤니티",
        backHref: philifeAppPaths.home,
        preferHistoryBack: true,
        ariaLabel: "피드로",
        showHubQuickActions: false,
        rightSlot,
      },
    });
    return () => setMainTier1Extras(null);
  }, [setMainTier1Extras, titleText, rightSlot]);

  return null;
}
