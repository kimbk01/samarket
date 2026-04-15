"use client";

import type { CallScreenViewModel } from "./call-ui.types";
import { CallActionBar } from "./CallActionBar";
import { CallAvatar } from "./CallAvatar";
import { CallStatusText } from "./CallStatusText";

export function IncomingCallView({ vm }: { vm: CallScreenViewModel }) {
  return (
    <div className="relative z-[2] flex min-h-0 flex-1 flex-col justify-between px-6 pb-[max(22px,calc(env(safe-area-inset-bottom)+12px))] pt-6">
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center">
          <CallAvatar label={vm.peerLabel} avatarUrl={vm.peerAvatarUrl} pulse />
          <div className="mt-8">
            <CallStatusText
              title={vm.peerLabel}
              status={vm.statusText}
              detail={vm.subStatusText ?? vm.footerNote ?? null}
            />
          </div>
        </div>
      </div>
      <div className="space-y-6">
        <CallActionBar actions={vm.primaryActions} />
        {vm.secondaryActions?.length ? <CallActionBar actions={vm.secondaryActions} compact /> : null}
      </div>
    </div>
  );
}
