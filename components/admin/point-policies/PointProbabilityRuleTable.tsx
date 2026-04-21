"use client";

import { useState } from "react";
import type {
  PointProbabilityRule,
  PointProbabilityTargetType,
} from "@/lib/types/point-policy";
import { TARGET_TYPE_LABELS } from "@/lib/point-policies/point-policy-utils";

interface PointProbabilityRuleTableProps {
  policyId: string | null;
  rules: PointProbabilityRule[];
  policyBoardName?: string;
  onSaveRule?: (
    rule: Omit<PointProbabilityRule, "id"> & { id?: string }
  ) => void;
  onDeleteRule?: (id: string) => void;
}

export function PointProbabilityRuleTable({
  policyId,
  rules,
  policyBoardName,
  onSaveRule,
  onDeleteRule,
}: PointProbabilityRuleTableProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [targetType, setTargetType] = useState<PointProbabilityTargetType>("write");
  const [minPoint, setMinPoint] = useState(1);
  const [maxPoint, setMaxPoint] = useState(5);
  const [probabilityPercent, setProbabilityPercent] = useState(50);
  const [sortOrder, setSortOrder] = useState(1);

  const totalPercent = rules.reduce((s, r) => s + r.probabilityPercent, 0);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!policyId || !onSaveRule) return;
    onSaveRule({
      policyId,
      targetType,
      minPoint,
      maxPoint,
      probabilityPercent,
      sortOrder: sortOrder || rules.length + 1,
    });
    setShowAddForm(false);
    setMinPoint(1);
    setMaxPoint(5);
    setProbabilityPercent(50);
    setSortOrder(rules.length + 1);
  };

  if (!policyId) {
    return (
      <p className="sam-text-body text-sam-muted">
        위에서 확률형 정책을 선택하면 구간을 설정할 수 있습니다.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="sam-text-body text-sam-muted">
          합계: {totalPercent}% {totalPercent !== 100 && "(100% 권장)"}
        </span>
        {onSaveRule && (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="rounded border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-body-secondary text-sam-fg hover:bg-sam-app"
          >
            구간 추가
          </button>
        )}
      </div>
      {showAddForm && onSaveRule && (
        <form
          onSubmit={handleAddSubmit}
          className="rounded border border-sam-border bg-sam-app p-3 sam-text-body"
        >
          <div className="mb-2 font-medium text-sam-fg">새 확률 구간</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <div>
              <label className="mb-0.5 block sam-text-helper text-sam-muted">대상</label>
              <select
                value={targetType}
                onChange={(e) =>
                  setTargetType(e.target.value as PointProbabilityTargetType)
                }
                className="w-full rounded border border-sam-border px-2 py-1.5 sam-text-body-secondary"
              >
                <option value="write">{TARGET_TYPE_LABELS.write}</option>
                <option value="comment">{TARGET_TYPE_LABELS.comment}</option>
              </select>
            </div>
            <div>
              <label className="mb-0.5 block sam-text-helper text-sam-muted">최소 P</label>
              <input
                type="number"
                min={0}
                value={minPoint}
                onChange={(e) => setMinPoint(parseInt(e.target.value, 10) || 0)}
                className="w-full rounded border border-sam-border px-2 py-1.5 sam-text-body-secondary"
              />
            </div>
            <div>
              <label className="mb-0.5 block sam-text-helper text-sam-muted">최대 P</label>
              <input
                type="number"
                min={0}
                value={maxPoint}
                onChange={(e) => setMaxPoint(parseInt(e.target.value, 10) || 0)}
                className="w-full rounded border border-sam-border px-2 py-1.5 sam-text-body-secondary"
              />
            </div>
            <div>
              <label className="mb-0.5 block sam-text-helper text-sam-muted">확률(%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={probabilityPercent}
                onChange={(e) =>
                  setProbabilityPercent(parseInt(e.target.value, 10) || 0)
                }
                className="w-full rounded border border-sam-border px-2 py-1.5 sam-text-body-secondary"
              />
            </div>
            <div>
              <label className="mb-0.5 block sam-text-helper text-sam-muted">순서</label>
              <input
                type="number"
                min={1}
                value={sortOrder}
                onChange={(e) =>
                  setSortOrder(parseInt(e.target.value, 10) || 1)
                }
                className="w-full rounded border border-sam-border px-2 py-1.5 sam-text-body-secondary"
              />
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="submit"
              className="rounded border border-signature bg-signature px-3 py-1.5 sam-text-body-secondary text-white"
            >
              추가
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-body-secondary text-sam-fg"
            >
              취소
            </button>
          </div>
        </form>
      )}
      {rules.length === 0 && !showAddForm ? (
        <p className="sam-text-body text-sam-muted">
          확률 구간이 없습니다. 게시판 정책에서 확률형을 사용할 때 여기에서 구간을 설정합니다.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[400px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  대상
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  구간(최소~최대)P
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  확률(%)
                </th>
                {onDeleteRule && (
                  <th className="px-3 py-2.5 text-right font-medium text-sam-fg">
                    작업
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="px-3 py-2.5 text-sam-fg">
                    {TARGET_TYPE_LABELS[r.targetType]}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {r.minPoint} ~ {r.maxPoint}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {r.probabilityPercent}%
                  </td>
                  {onDeleteRule && (
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteRule(r.id)}
                        className="sam-text-body-secondary text-red-600 hover:underline"
                      >
                        삭제
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
