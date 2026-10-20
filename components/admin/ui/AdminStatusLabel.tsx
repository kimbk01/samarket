/**
 * Admin 상태 라벨 (설계 v4 §7 「상태 표시」) — 레지스트리(`admin-status-label-registry`) 조회 결과를 `AdminToneBadge` 로 그린다.
 * 미등록 코드는 「알 수 없는 상태」. 원시 코드는 화면에 쓰지 않고 `data-admin-status-code` 에만 남긴다.
 */

import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import {
  ADMIN_STATUS_COMMON_NAMESPACE,
  ADMIN_STATUS_TONE_TO_BADGE,
  lookupAdminStatusLabel,
} from "@/lib/admin/status-labels/admin-status-label-registry";

export function AdminStatusLabel({
  code,
  ko,
  namespace = ADMIN_STATUS_COMMON_NAMESPACE,
  className,
}: {
  code: string | null | undefined;
  ko: boolean;
  namespace?: string;
  className?: string;
}) {
  const r = lookupAdminStatusLabel(namespace, code);
  return (
    <span
      data-admin-status-code={r.code}
      data-admin-status-known={r.known ? "1" : "0"}
      data-admin-status-namespace={r.namespace ?? undefined}
    >
      <AdminToneBadge tone={ADMIN_STATUS_TONE_TO_BADGE[r.tone]} className={className}>
        {ko ? r.ko : r.en}
      </AdminToneBadge>
    </span>
  );
}
