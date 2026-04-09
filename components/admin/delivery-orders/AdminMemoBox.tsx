"use client";

import { useState } from "react";

export function AdminMemoBox({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (memo: string) => void;
}) {
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(false);

  return (
    <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">관리자 메모</h3>
      <textarea
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          setSaved(false);
        }}
        rows={4}
        className="mt-2 w-full rounded border border-gray-200 px-3 py-2 text-sm"
      />
      <button
        type="button"
        onClick={() => {
          onSave(v);
          setSaved(true);
        }}
        className="mt-2 rounded-ui-rect bg-gray-900 px-4 py-2 text-sm font-medium text-white"
      >
        메모 저장
      </button>
      {saved ? <p className="mt-2 text-xs text-emerald-600">저장됨 (시뮬)</p> : null}
    </div>
  );
}
