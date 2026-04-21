export interface ProfileStatRowProps {
  label: string;
  value: string | number;
}

export function ProfileStatRow({ label, value }: ProfileStatRowProps) {
  return (
    <div className="flex items-center justify-between sam-text-body-secondary">
      <span className="text-sam-muted">{label}</span>
      <span className="text-sam-fg">{value}</span>
    </div>
  );
}
