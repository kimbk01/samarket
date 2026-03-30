"use client";

import { parseMeetingJoinRequestMessage } from "@/lib/neighborhood/meeting-join-request-message";

export function JoinRequestMessagePreview({ text }: { text: string }) {
  const parsed = parseMeetingJoinRequestMessage(text);
  if (!parsed) {
    return (
      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-amber-50/90 px-2.5 py-2 text-[12px] leading-relaxed text-gray-800">
        {text || "내용 없음"}
      </p>
    );
  }
  const rows: { k: string; v: string }[] = [
    { k: "닉네임", v: parsed.nickname },
    { k: "소개", v: parsed.intro },
    { k: "참여 이유", v: parsed.reason },
    { k: "메모", v: parsed.note },
  ];
  return (
    <dl className="mt-2 space-y-2 rounded-lg border border-amber-100 bg-amber-50/60 px-2.5 py-2 text-[12px]">
      {rows.map(({ k, v }) => (
        <div key={k}>
          <dt className="font-semibold text-amber-900/90">{k}</dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-gray-800">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
