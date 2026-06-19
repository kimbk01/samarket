"use client";

import { memo, type CSSProperties, type ReactNode } from "react";

/** 타임라인 virtual/direct row stack — render·scroll owner 분리용 얇은 host */
export const MessengerRoomMessageListHost = memo(function MessengerRoomMessageListHost({
  children,
  stackClassName,
  contentHeight,
  useDirectLayout,
}: {
  children: ReactNode;
  stackClassName?: string;
  contentHeight: number;
  useDirectLayout: boolean;
}) {
  const style: CSSProperties | undefined =
    useDirectLayout || contentHeight <= 0 ? undefined : { height: contentHeight };

  return (
    <div className={`relative w-full ${stackClassName ?? ""}`.trim()} style={style}>
      {children}
    </div>
  );
});
