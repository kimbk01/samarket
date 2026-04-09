"use client";

import { IG_DM_BUBBLE_ROW_MAX, IG_DM_BUBBLE_PAD } from "@/lib/chats/instagram-dm-tokens";

type Props = {
  variant?: "default" | "instagram";
};

/** 메시지 GET 대기 중 — 실제 말풍선 레이아웃에 맞춘 스켈레톤(전면 문구 대신 체감 속도 개선) */
export function ChatMessagesLoadingSkeleton({ variant = "default" }: Props) {
  const ig = variant === "instagram";
  const rowMax = ig ? IG_DM_BUBBLE_ROW_MAX : "max-w-[min(82vw,20rem)] sm:max-w-[72%]";
  const gap = ig ? "gap-2.5" : "gap-2";
  const avatar = ig ? "h-8 w-8 rounded-full bg-black/[0.06]" : "h-[34px] w-[34px] rounded-full bg-gray-200/90";

  const opponentBubble = ig
    ? `min-h-[36px] min-w-[120px] rounded-ui-rect bg-[#F0F0F0]/80 ${IG_DM_BUBBLE_PAD}`
    : "min-h-[36px] min-w-[120px] rounded-ui-rect bg-white shadow-sm";
  const mineBubble = ig ? `min-h-[36px] min-w-[100px] rounded-ui-rect bg-signature/35 ${IG_DM_BUBBLE_PAD}` : "min-h-[36px] min-w-[100px] rounded-ui-rect bg-[#FEE500]/50 shadow-sm";

  return (
    <ul
      className={`list-none space-y-0 px-2 py-3 ${ig ? "min-h-[200px]" : "min-h-[220px]"}`}
      aria-busy="true"
      aria-label="메시지 불러오는 중"
    >
      <span className="sr-only">메시지를 불러오는 중입니다.</span>

      <li className="flex justify-start pt-1">
        <div className={`flex ${rowMax} items-end ${gap}`}>
          <div className={`shrink-0 ${avatar} animate-pulse`} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {!ig ? <div className="h-3 w-16 animate-pulse rounded bg-gray-200/80" /> : null}
            <div className={`${opponentBubble} animate-pulse`}>
              <div className={`space-y-2 ${ig ? "py-0.5" : ""}`}>
                <div className={`h-2.5 rounded-full ${ig ? "bg-black/[0.08]" : "bg-gray-200/90"} w-[85%]`} />
                <div className={`h-2.5 rounded-full ${ig ? "bg-black/[0.06]" : "bg-gray-100"} w-[55%]`} />
              </div>
            </div>
          </div>
        </div>
      </li>

      <li className={`flex justify-end ${ig ? "mt-2.5" : "mt-3"}`}>
        <div className={`flex flex-col items-end ${rowMax}`}>
          <div className={`${mineBubble} animate-pulse`}>
            <div className={`h-2.5 rounded-full ${ig ? "bg-white/40" : "bg-[#111]/10"} w-[72%]`} />
          </div>
        </div>
      </li>

      <li className={`flex justify-start ${ig ? "mt-2.5" : "mt-3"}`}>
        <div className={`flex ${rowMax} items-end ${gap}`}>
          <div className={`shrink-0 ${avatar} animate-pulse`} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {!ig ? <div className="h-3 w-20 animate-pulse rounded bg-gray-200/80" /> : null}
            <div className={`${opponentBubble} animate-pulse`}>
              <div
                className={`h-2.5 w-[40%] rounded-full ${ig ? "bg-black/[0.08]" : "bg-gray-200/80"}`}
              />
            </div>
          </div>
        </div>
      </li>

      <li className={`flex justify-end ${ig ? "mt-2.5" : "mt-3"}`}>
        <div className={`flex flex-col items-end ${rowMax}`}>
          <div className={`${mineBubble} animate-pulse`}>
            <div className="space-y-2">
              <div className={`h-2.5 rounded-full ${ig ? "bg-white/35" : "bg-[#111]/10"} w-[90%]`} />
              <div className={`h-2.5 rounded-full ${ig ? "bg-white/25" : "bg-[#111]/8"} w-[40%]`} />
            </div>
          </div>
        </div>
      </li>
    </ul>
  );
}
