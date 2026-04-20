"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, Video } from "lucide-react";
import { primeCommunityMessengerDevicePermissionFromUserGesture } from "@/lib/community-messenger/call-permission";
import { bootstrapCommunityMessengerOutgoingCallAndNavigate } from "@/lib/community-messenger/call-session-navigation-seed";
import {
  tradeChatCallPolicyAllowsVideo,
  tradeChatCallPolicyAllowsVoice,
  type TradeChatCallPolicy,
} from "@/lib/trade/trade-chat-call-policy";

type CallKind = "voice" | "video";

/**
 * 거래 1:1 채팅 헤더 — 구매자만, 판매자가 `posts.meta.trade_chat_call_policy` 로 허용한 경우 메신저 통화 시작.
 */
export function TradeChatCallHeaderButtons(props: {
  policy: TradeChatCallPolicy;
  productChatRoomId: string;
  onErrorMessage: (message: string) => void;
}) {
  const { policy, productChatRoomId, onErrorMessage } = props;
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const startCall = useCallback(
    async (kind: CallKind) => {
      const rid = productChatRoomId.trim();
      if (!rid || busy) return;
      setBusy(true);
      try {
        const res = await fetch("/api/community-messenger/bridge/product-chat", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: rid }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          roomId?: string;
          error?: string;
          code?: string;
        };
        if (!res.ok || json.ok !== true || typeof json.roomId !== "string" || !json.roomId.trim()) {
          const code = typeof json.code === "string" ? json.code : "";
          onErrorMessage(
            code === "not_participant"
              ? "이 채팅에서 통화를 시작할 수 없습니다."
              : code === "product_chat_not_found"
                ? "거래 채팅을 찾을 수 없습니다."
                : "메신저 연결에 실패했습니다. 잠시 후 다시 시도해 주세요."
          );
          return;
        }
        const result = await bootstrapCommunityMessengerOutgoingCallAndNavigate(
          { roomId: json.roomId.trim(), peerUserId: null, kind },
          (href) => router.push(href)
        );
        if (!result.ok) {
          onErrorMessage(result.userMessage);
        }
      } catch {
        onErrorMessage("네트워크 오류로 통화를 시작하지 못했습니다.");
      } finally {
        setBusy(false);
      }
    },
    [busy, onErrorMessage, productChatRoomId, router]
  );

  if (!tradeChatCallPolicyAllowsVoice(policy)) return null;

  return (
    <div className="flex shrink-0 items-center gap-0.5 pr-0.5">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void primeCommunityMessengerDevicePermissionFromUserGesture("voice");
          void startCall("voice");
        }}
        className="flex h-10 w-10 items-center justify-center rounded-ui-rect text-sam-fg hover:bg-black/10 disabled:opacity-50"
        aria-label="음성 통화"
      >
        <Phone className="h-5 w-5" strokeWidth={2} />
      </button>
      {tradeChatCallPolicyAllowsVideo(policy) ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void primeCommunityMessengerDevicePermissionFromUserGesture("video");
            void startCall("video");
          }}
          className="flex h-10 w-10 items-center justify-center rounded-ui-rect text-sam-fg hover:bg-black/10 disabled:opacity-50"
          aria-label="영상 통화"
        >
          <Video className="h-5 w-5" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}
