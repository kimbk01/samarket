"use client";

import { useMemo, useState, useEffect } from "react";
import { getBackupSnapshots } from "@/lib/backup/mock-backup-snapshots";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getSnapshotTypeLabel,
  getSnapshotStatusLabel,
} from "@/lib/backup/backup-utils";
import type {
  BackupSnapshotStatus,
  BackupSnapshotType,
} from "@/lib/types/backup";
import Link from "next/link";

/** 서버/클라이언트 로케일 차이로 인한 hydration 방지: 마운트 후에만 날짜 표시 */
function ClientDate({ value }: { value: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="invisible">-</span>;
  return <>{new Date(value).toLocaleString("ko-KR")}</>;
}

export function BackupSnapshotTable() {
  const [statusFilter, setStatusFilter] = useState<BackupSnapshotStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<BackupSnapshotType | "">("");

  const snapshots = useMemo(
    () =>
      getBackupSnapshots({
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(typeFilter ? { snapshotType: typeFilter } : {}),
      }),
    [statusFilter, typeFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-gray-600">상태</span>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter((e.target.value || "") as BackupSnapshotStatus | "")
          }
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          <option value="">전체</option>
          <option value="pending">대기</option>
          <option value="running">진행중</option>
          <option value="completed">완료</option>
          <option value="failed">실패</option>
        </select>
        <span className="text-[13px] text-gray-600">유형</span>
        <select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter((e.target.value || "") as BackupSnapshotType | "")
          }
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          <option value="">전체</option>
          <option value="manual">수동</option>
          <option value="scheduled">예약</option>
          <option value="pre-release">배포 전</option>
          <option value="emergency">긴급</option>
        </select>
      </div>

      {snapshots.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
          해당 조건의 백업이 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={[
            "스냅샷명",
            "유형",
            "상태",
            "시작",
            "완료",
            "크기",
            "작성자",
            "",
          ]}
        >
          {snapshots.map((s) => (
            <tr key={s.id} className="border-b border-gray-100">
              <td className="px-3 py-2.5 font-medium text-gray-900">
                {s.snapshotName}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-600">
                {getSnapshotTypeLabel(s.snapshotType)}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[12px] ${
                    s.status === "completed"
                      ? "bg-emerald-50 text-emerald-700"
                      : s.status === "failed"
                        ? "bg-red-100 text-red-800"
                        : s.status === "running"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {getSnapshotStatusLabel(s.status)}
                </span>
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-500">
                <ClientDate value={s.startedAt} />
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-500">
                {s.completedAt ? (
                  <ClientDate value={s.completedAt} />
                ) : (
                  "-"
                )}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-600">
                {s.size}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-500">
                {s.createdByAdminId ?? "시스템"}
              </td>
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/backup/${s.id}`}
                  className="text-signature hover:underline"
                >
                  상세
                </Link>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
