"use client";

import type { TradePresenceLiveState } from "@/lib/chats/trade-presence-policy";
import { tradePresenceStateLabel } from "@/lib/chats/trade-presence-policy";

function Dot({ state }: { state: TradePresenceLiveState }) {
  const cls =
    state === "online"
      ? "bg-emerald-500"
      : state === "away"
        ? "bg-amber-400"
        : "bg-sam-muted";
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} aria-hidden />;
}

export function TradeChatPresenceHeaderRow(props: {
  peerSharesLive: boolean;
  peerLiveState: TradePresenceLiveState;
  peerTyping: boolean;
  peerLastSeenLabel: string;
}) {
  const { peerSharesLive, peerLiveState, peerTyping, peerLastSeenLabel } = props;

  return (
    <div className="mt-0.5 flex min-h-[18px] flex-wrap items-center gap-x-2 gap-y-0.5 sam-text-helper text-sam-muted">
      {peerTyping ? (
        <span className="font-medium text-signature">입력 중…</span>
      ) : null}
      {peerSharesLive ? (
        <span className="inline-flex items-center gap-1.5">
          <Dot state={peerLiveState} />
          <span className="text-sam-fg/80">{tradePresenceStateLabel(peerLiveState)}</span>
        </span>
      ) : null}
      {peerLiveState === "offline" && peerLastSeenLabel ? (
        <span className="text-sam-muted">{peerLastSeenLabel}</span>
      ) : null}
    </div>
  );
}
