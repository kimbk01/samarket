"use client";

import { Phone, PhoneIncoming, PhoneOutgoing, Video } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CommunityMessengerCallDirectionBadge } from "@/components/community-messenger/call-history/CommunityMessengerCallDirectionBadge";
import { presentCallHistoryRow } from "@/lib/community-messenger/call-history/call-history-presenter";
import { formatCallPeerDetailRowTime, resolveCallLogListTimestampIso } from "@/lib/community-messenger/call-log-row-copy";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";

const OVERLAY_GREEN = "#006241";
const OVERLAY_RED = "#E53935";

type Props = {
  call: CommunityMessengerCallLog;
};

export function CommunityMessengerCallPeerHistoryRow({ call }: Props) {
  const { safeT, language } = useI18n();
  const vm = presentCallHistoryRow(call);
  const timeLabel = formatCallPeerDetailRowTime(resolveCallLogListTimestampIso(call), language);
  const kindLabel = safeT(vm.subtitleMessageKey, {
    fallbackKo: "통화 기록",
    fallbackEn: "Call log",
  });

  const Icon = vm.callKind === "video" ? Video : Phone;
  const DirectionIcon =
    vm.displayType === "outgoing"
      ? PhoneOutgoing
      : vm.displayType === "incoming"
        ? PhoneIncoming
        : vm.isMissed
          ? Phone
          : vm.isOutgoing
            ? PhoneOutgoing
            : PhoneIncoming;
  const iconColor = vm.isMissed ? OVERLAY_RED : OVERLAY_GREEN;

  return (
    <li className="flex items-start gap-3 border-b border-sam-border px-4 py-3">
      <div className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sam-surface-muted">
        <Icon className="h-4 w-4 text-sam-fg-muted" aria-hidden />
        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-sam-app ring-1 ring-sam-border">
          <DirectionIcon className="h-2.5 w-2.5" style={{ color: iconColor }} aria-hidden />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="sam-text-body font-semibold text-sam-fg tabular-nums">{timeLabel}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <CommunityMessengerCallDirectionBadge displayType={vm.displayType} />
          <span className="sam-text-body-secondary text-sam-fg-muted">{kindLabel}</span>
          {vm.durationLabel ? (
            <>
              <span className="text-sam-border">|</span>
              <span className="sam-text-body-secondary text-sam-fg-muted tabular-nums">{vm.durationLabel}</span>
            </>
          ) : null}
        </div>
      </div>
    </li>
  );
}
