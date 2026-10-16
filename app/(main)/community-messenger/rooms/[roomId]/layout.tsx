import type { ReactNode } from "react";

/**
 * Room segment layout — no behind-the-scenes ShellChromeFrame.
 * (May–Jul BN13/BN14 fake shell host removed: it painted header-without-back first.)
 */
export default async function CommunityMessengerRoomSegmentLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ roomId: string }>;
}) {
  await params;
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" data-cm-room-segment-layout="">
      <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
