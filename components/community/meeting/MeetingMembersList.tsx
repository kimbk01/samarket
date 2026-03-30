"use client";

export function MeetingMembersList({ labels }: { labels: { userId: string; name: string }[] }) {
  if (!labels.length) return <p className="text-[14px] text-gray-500">참여자가 없습니다.</p>;
  return (
    <ul className="divide-y divide-gray-100">
      {labels.map((m) => (
        <li key={m.userId} className="py-2 text-[14px] text-gray-800">
          {m.name}
        </li>
      ))}
    </ul>
  );
}
