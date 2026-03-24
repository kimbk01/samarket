"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { getPointExpirePolicies } from "@/lib/points/mock-point-expire-policies";
import { getPointExpireExecutions } from "@/lib/points/mock-point-expire-executions";
import { getPointExpireLogs } from "@/lib/points/mock-point-expire-logs";
import { AdminPointExpirePolicyCard } from "./AdminPointExpirePolicyCard";
import { AdminPointExpireTable } from "./AdminPointExpireTable";
import { AdminPointExpireRunPanel } from "./AdminPointExpireRunPanel";
import { AdminPointExpireLogList } from "./AdminPointExpireLogList";

export function AdminPointExpirePage() {
  const [refresh, setRefresh] = useState(0);
  const policies = useMemo(() => getPointExpirePolicies(), []);
  const activePolicy = useMemo(
    () => policies.find((p) => p.isActive),
    [policies]
  );
  const executions = useMemo(
    () => getPointExpireExecutions(),
    [refresh]
  );
  const logs = useMemo(() => getPointExpireLogs(), [refresh]);

  const totalExpired = useMemo(
    () => executions.reduce((s, e) => s + e.expiredPoint, 0),
    [executions]
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader title="포인트 만료" />

      {activePolicy ? (
        <AdminCard title="적용 정책">
          <AdminPointExpirePolicyCard policy={activePolicy} />
        </AdminCard>
      ) : (
        <AdminCard title="적용 정책">
          <p className="text-[14px] text-gray-500">
            활성화된 만료 정책이 없습니다.
          </p>
        </AdminCard>
      )}

      <AdminCard title="만료 실행">
        <AdminPointExpireRunPanel onRunComplete={() => setRefresh((r) => r + 1)} />
      </AdminCard>

      {executions.length > 0 && (
        <AdminCard title="실행 결과 요약">
          <div className="flex flex-wrap gap-4 text-[14px]">
            <div>
              <span className="text-gray-500">실행 건수</span>
              <span className="ml-2 font-medium text-gray-900">
                {executions.length}건
              </span>
            </div>
            <div>
              <span className="text-gray-500">총 만료 P</span>
              <span className="ml-2 font-medium text-gray-900">
                {totalExpired}P
              </span>
            </div>
          </div>
        </AdminCard>
      )}

      <AdminCard title="만료 실행 이력">
        <AdminPointExpireTable executions={executions} />
      </AdminCard>

      <AdminCard title="만료 로그">
        <AdminPointExpireLogList logs={logs} />
      </AdminCard>
    </div>
  );
}
