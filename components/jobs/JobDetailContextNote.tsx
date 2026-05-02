"use client";

import type { JobDetailDirection } from "@/lib/jobs/resolve-job-detail-direction";
import { TRADE_FB_DETAIL_META_HELP } from "@/lib/ui/trade-write-fb-ui";

export function JobDetailContextNote({ direction }: { direction: JobDetailDirection }) {
  const extra =
    direction === "hiring"
      ? "채팅으로 지원자와 연락할 수 있어요."
      : "채팅으로 구직자에게 연락할 수 있어요.";

  return (
    <div className={`space-y-1 ${TRADE_FB_DETAIL_META_HELP}`}>
      <p className="mb-0">연락은 채팅으로 주고받아요. 전화번호는 글에 표시되지 않습니다.</p>
      <p className="mb-0">{extra}</p>
    </div>
  );
}
