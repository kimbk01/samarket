"use client";

import type { CallScreenViewModel } from "./call-ui.types";
import { CallActionBar } from "./CallActionBar";
import { CallAvatar } from "./CallAvatar";
import { CallStatusText } from "./CallStatusText";

export function OutgoingCallView({ vm }: { vm: CallScreenViewModel }) {
  const isVideo = vm.mode === "video";

  return (
    <div className="relative z-[2] flex min-h-0 flex-1 flex-col justify-end px-4 pb-[max(14px,calc(env(safe-area-inset-bottom)+8px))] pt-2">
      <div
        className={`flex min-h-0 flex-1 flex-col ${isVideo ? "justify-start pt-[min(18vh,140px)]" : "items-center justify-center"}`}
      >
        {!isVideo ? (
          <>
            <CallAvatar label={vm.peerLabel} avatarUrl={vm.peerAvatarUrl} pulse />
            <div className="mt-8">
              <CallStatusText
                title={vm.peerLabel}
                status={vm.statusText}
                detail={vm.subStatusText ?? vm.footerNote ?? null}
              />
            </div>
          </>
        ) : (
          <div className="w-full max-w-md self-center px-2">
            <CallStatusText
              title={vm.peerLabel}
              status={vm.statusText}
              detail={vm.subStatusText ?? vm.footerNote ?? null}
            />
          </div>
        )}
      </div>

      <div className="rounded-t-3xl bg-gradient-to-t from-black/70 via-black/32 to-transparent px-1 pt-12 pb-1">
        <CallActionBar actions={vm.primaryActions} />
        {vm.secondaryActions?.length ? (
          <div className="mt-4">
            <CallActionBar actions={vm.secondaryActions} compact />
          </div>
        ) : null}
      </div>
    </div>
  );
}
