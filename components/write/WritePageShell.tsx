"use client";

import { useRef, type ReactNode } from "react";
import { useIosFormKeyboardVisibleBand } from "@/lib/ui/use-ios-form-keyboard-visible-band";

interface WritePageShellProps {
  children: ReactNode;
}

/** Trade/community write shell — iOS keyboard visible-band; Android adjustResize. */
export function WritePageShell({ children }: WritePageShellProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  useIosFormKeyboardVisibleBand({ enabled: true, shellRef });
  return (
    <div
      ref={shellRef}
      data-dibay-ios-form-shell=""
      className="dibay-ios-form-shell flex min-h-screen flex-col bg-sam-app"
    >
      <div className="dibay-ios-form-shell__scroll flex-1 pb-24">{children}</div>
    </div>
  );
}
