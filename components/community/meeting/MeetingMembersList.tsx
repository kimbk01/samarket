"use client";

export function MeetingMembersList({ labels }: { labels: { userId: string; name: string }[] }) {
  if (!labels.length) return <p className="text-[14px] text-sam-muted">참여자가 없습니다.</p>;
  return (
    <ul className="divide-y divide-sam-border-soft">
      {labels.map((m) => (
        <li key={m.userId} className="py-2 text-[14px] text-sam-fg">
          {m.name}
        </li>
      ))}
    </ul>
  );
}
