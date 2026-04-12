"use client";

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
}

export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <section className="pt-4 first:pt-2">
      <h2 className="sam-settings-section-title">{title}</h2>
      <div className="sam-settings-group">{children}</div>
    </section>
  );
}
