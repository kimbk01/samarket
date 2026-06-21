"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Phone, Video } from "lucide-react";
import { unlockCommunityMessengerCallPlaybackFromUserGesture } from "@/lib/community-messenger/call-feedback-sound";
import {
  cmCallLatencyInfo,
  cmCallLatencyMarkClick,
  setCmCallLatencyContext,
} from "@/lib/community-messenger/cm-call-debug";
import { launchOutgoingDirectCall } from "@/lib/community-messenger/call-session-navigation-seed";
import {
  guardInstantOutgoingCallStart,
  isOutgoingCallPhoneVerificationRequired,
  navigateBlockedOutgoingCall,
} from "@/lib/call/outgoing-call-start-guard";
import { useOutgoingCallBlocked } from "@/lib/call/use-outgoing-call-blocked";
import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import {
  tradeChatCallPolicyAllowsVideo,
  tradeChatCallPolicyAllowsVoice,
  type TradeChatCallPolicy,
} from "@/lib/trade/trade-chat-call-policy";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type CallKind = "voice" | "video";

/**
 * 거래 1:1 채팅 헤더 — 구매자만, 판매자가 `posts.meta.trade_chat_call_policy` 로 허용한 경우 메신저 통화 시작.
 */
export function TradeChatCallHeaderButtons(props: {
  policy: TradeChatCallPolicy;
  /** `product_chats.id` 또는 브리지에 넘길 거래 스레드 식별자 */
  productChatRoomId: string;
  /** 서버가 이미 연결한 메신저 직통방이면 브리지 왕복 생략 */
  communityMessengerRoomId?: string | null;
  onErrorMessage: (message: string) => void;
}) {
  const { t } = useI18n();
  const { policy, productChatRoomId, communityMessengerRoomId, onErrorMessage } = props;
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [busy, setBusy] = useState(false);
  const { blocked: outgoingBlocked } = useOutgoingCallBlocked();

  const startCall = useCallback(
    async (kind: CallKind) => {
      const pcRid = productChatRoomId.trim();
      const cmRid = communityMessengerRoomId?.trim() ?? "";
      if ((!pcRid && !cmRid) || busy || outgoingBlocked) return;
      const guard = guardInstantOutgoingCallStart({
        roomId: cmRid || undefined,
        kind,
      });
      if (!guard.ok) {
        if (isOutgoingCallPhoneVerificationRequired(guard)) return;
        if (guard.blockedCallId) navigateBlockedOutgoingCall(router, guard.blockedCallId);
        else onErrorMessage(guard.userMessage);
        return;
      }
      setBusy(true);
      try {
        let messengerRoomId = cmRid;
        if (!messengerRoomId) {
          const res = await fetch("/api/community-messenger/bridge/product-chat", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomId: pcRid }),
          });
          const json = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            roomId?: string;
            error?: string;
            code?: string;
          };
          if (!res.ok || json.ok !== true || typeof json.roomId !== "string" || !json.roomId.trim()) {
            const rawErr =
              typeof json.error === "string" && json.error.trim()
                ? json.error.trim()
                : typeof json.code === "string" && json.code.trim()
                  ? json.code.trim()
                  : "";
            const next = pathname.trim() || "/philife";
            if (redirectForBlockedAction(router, rawErr || undefined, next)) return;
            const code = typeof json.code === "string" ? json.code : "";
            onErrorMessage(
              code === "not_participant"
                ? t("chats_trade_call_not_allowed")
                : code === "product_chat_not_found"
                  ? t("chats_trade_call_room_not_found")
                  : t("chats_trade_call_bridge_failed")
            );
            return;
          }
          messengerRoomId = json.roomId.trim();
        }
        cmCallLatencyMarkClick({ surface: "trade_chat_header", roomId: messengerRoomId, kind });
        setCmCallLatencyContext({ role: "initiator", callKind: kind, roomId: messengerRoomId });
        cmCallLatencyInfo("outgoing_route_push_start", {
          roomId: messengerRoomId,
          callKind: kind,
          role: "initiator",
        });
        const result = await launchOutgoingDirectCall({ kind, roomId: messengerRoomId }, router);
        if (!result.ok) {
          if (isOutgoingCallPhoneVerificationRequired(result)) return;
          onErrorMessage(result.userMessage);
        }
      } catch {
        onErrorMessage(t("chats_trade_call_network_error"));
      } finally {
        setBusy(false);
      }
    },
    [busy, communityMessengerRoomId, onErrorMessage, outgoingBlocked, pathname, productChatRoomId, router]
  );

  if (!tradeChatCallPolicyAllowsVoice(policy)) return null;

  return (
    <div className="flex shrink-0 items-center gap-0.5 pr-0.5">
      <button
        type="button"
        disabled={busy || outgoingBlocked}
        onClick={() => {
          cmCallLatencyMarkClick({ surface: "trade_chat_header", callKind: "voice" });
          setCmCallLatencyContext({ role: "initiator", callKind: "voice" });
          unlockCommunityMessengerCallPlaybackFromUserGesture();
          void startCall("voice");
        }}
        className="flex h-10 w-10 items-center justify-center rounded-ui-rect text-sam-fg hover:bg-black/10 disabled:opacity-50"
        aria-label={t("chats_trade_call_voice_aria")}
      >
        <Phone className="h-5 w-5" strokeWidth={2} />
      </button>
      {tradeChatCallPolicyAllowsVideo(policy) ? (
        <button
          type="button"
          disabled={busy || outgoingBlocked}
          onClick={() => {
            cmCallLatencyMarkClick({ surface: "trade_chat_header", callKind: "video" });
            setCmCallLatencyContext({ role: "initiator", callKind: "video" });
            unlockCommunityMessengerCallPlaybackFromUserGesture();
            void startCall("video");
          }}
          className="flex h-10 w-10 items-center justify-center rounded-ui-rect text-sam-fg hover:bg-black/10 disabled:opacity-50"
          aria-label={t("chats_trade_call_video_aria")}
        >
          <Video className="h-5 w-5" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}
