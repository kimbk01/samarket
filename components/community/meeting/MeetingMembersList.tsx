"use client";

export function MeetingMembersList({ labels }: { labels: { userId: string; name: string }[] }) {
  if (!labels.length) return <p className="sam-text-body text-sam-muted">참여자가 없습니다.</p>;
  return (
    <ul className="divide-y divide-sam-border-soft">
      {labels.map((m) => (
        <li key={m.userId} className="py-2 sam-text-body text-sam-fg">
          {m.name}
        </li>
      ))}
    </ul>
  );
}
