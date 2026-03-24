"use client";

export interface ProfileRegionFieldProps {
  regionName: string;
  regionCode: string;
  onRegionNameChange: (v: string) => void;
  onRegionCodeChange: (v: string) => void;
}

export function ProfileRegionField({
  regionName,
  regionCode,
  onRegionNameChange,
  onRegionCodeChange,
}: ProfileRegionFieldProps) {
  return (
    <div className="space-y-2">
      <label className="text-[14px] font-medium text-gray-700">동네</label>
      <div className="grid gap-2">
        <input
          type="text"
          value={regionName}
          onChange={(e) => onRegionNameChange(e.target.value)}
          placeholder="예: 마닐라 · Malate"
          className="rounded border border-gray-200 px-3 py-2 text-[14px]"
        />
        <input
          type="text"
          value={regionCode}
          onChange={(e) => onRegionCodeChange(e.target.value)}
          placeholder="지역 코드 (선택)"
          className="rounded border border-gray-200 px-3 py-2 text-[14px]"
        />
      </div>
    </div>
  );
}
