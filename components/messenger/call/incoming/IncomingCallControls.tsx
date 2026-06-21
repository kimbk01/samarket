"use client";

import { IncomingCallButton, type IncomingCallButtonMode } from "./IncomingCallButton";

export function IncomingCallControls({
  acceptLabel,
  rejectLabel,
  busyAccept,
  busyReject,
  mode = "fullscreen",
  onAccept,
  onReject,
}: {
  acceptLabel: string;
  rejectLabel: string;
  busyAccept: boolean;
  busyReject: boolean;
  mode?: IncomingCallButtonMode;
  onAccept: () => void;
  onReject: () => void;
}) {
  const rowClass =
    mode === "popup" ? "incoming-call-controls--compact" : "incoming-call-controls--large";

  return (
    <div className={`incoming-call-controls ${rowClass}`}>
      <IncomingCallButton
        variant="reject"
        mode={mode}
        label={rejectLabel}
        ariaLabel={rejectLabel}
        disabled={busyReject || busyAccept}
        onAction={onReject}
      />
      <IncomingCallButton
        variant="accept"
        mode={mode}
        label={acceptLabel}
        ariaLabel={acceptLabel}
        disabled={busyAccept}
        onAction={onAccept}
      />
    </div>
  );
}
