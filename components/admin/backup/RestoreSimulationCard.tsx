"use client";

import { useMemo, useState } from "react";
import { getBackupSnapshots } from "@/lib/backup/mock-backup-snapshots";
import { getBackupRestores } from "@/lib/backup/mock-backup-restores";
import { getRestoreStatusLabel, getRestoreTypeLabel } from "@/lib/backup/backup-utils";

export function RestoreSimulationCard() {
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>("");
  const [simulateResult, setSimulateResult] = useState<string | null>(null);

  const snapshots = useMemo(
    () => getBackupSnapshots({ status: "completed" }),
    []
  );
  const restores = useMemo(() => getBackupRestores(), []);

  const handleSimulate = () => {
    if (!selectedSnapshotId) return;
    setSimulateResult(
      `복구 시뮬레이션: 스냅샷 ${selectedSnapshotId} 선택. 대상 테이블·행 수 검증 완료 (mock). 실제 복구는 "복구 실행"으로 진행합니다.`
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-sam-muted">스냅샷 (완료된 것만)</span>
        <select
          value={selectedSnapshotId}
          onChange={(e) => {
            setSelectedSnapshotId(e.target.value);
            setSimulateResult(null);
          }}
          className="rounded border border-sam-border px-3 py-1.5 text-[13px] text-sam-fg"
        >
          <option value="">선택</option>
          {snapshots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.snapshotName} ({s.size})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSimulate}
          disabled={!selectedSnapshotId}
          className="rounded border border-sam-border bg-sam-app px-3 py-1.5 text-[13px] text-sam-fg hover:bg-sam-surface-muted disabled:opacity-50"
        >
          복구 시뮬레이션
        </button>
      </div>
      {simulateResult && (
        <div className="rounded-ui-rect border border-emerald-200 bg-emerald-50/30 p-4 text-[13px] text-sam-fg">
          {simulateResult}
        </div>
      )}
      <div className="rounded-ui-rect border border-sam-border bg-sam-app/50 p-4">
        <p className="text-[13px] font-medium text-sam-fg">최근 복구 로그</p>
        {restores.length === 0 ? (
          <p className="mt-2 text-[13px] text-sam-muted">복구 이력 없음</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {restores.slice(0, 5).map((r) => (
              <li key={r.id} className="text-[13px] text-sam-muted">
                스냅샷 {r.snapshotId} · {getRestoreTypeLabel(r.restoreType)} ·{" "}
                {getRestoreStatusLabel(r.restoreStatus)} ·{" "}
                {r.completedAt
                  ? new Date(r.completedAt).toLocaleString()
                  : "진행 중"}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
