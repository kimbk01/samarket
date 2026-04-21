"use client";

interface EmergencyNoticeBarProps {
  text: string;
}

export function EmergencyNoticeBar({ text }: EmergencyNoticeBarProps) {
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-3 py-2.5 text-center">
      <p className="sam-text-body-secondary text-amber-900">{text}</p>
    </div>
  );
}
