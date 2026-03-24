export interface ProfileStatRowProps {
  label: string;
  value: string | number;
}

export function ProfileStatRow({ label, value }: ProfileStatRowProps) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900">{value}</span>
    </div>
  );
}
