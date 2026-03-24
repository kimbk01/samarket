"use client";

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
}

export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <section className="pt-4 first:pt-2">
      <h2 className="px-4 pb-2 text-[13px] font-medium text-gray-500">{title}</h2>
      <div className="bg-white">{children}</div>
    </section>
  );
}
