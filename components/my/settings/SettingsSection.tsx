"use client";

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
  /** 섹션 제목만 살짝 줄일 때 (알림 설정 등) */
  titleClassName?: string;
}

export function SettingsSection({ title, children, titleClassName }: SettingsSectionProps) {
  return (
    <section className="pt-4 first:pt-2">
      <h2 className={`sam-settings-section-title${titleClassName ? ` ${titleClassName}` : ""}`}>{title}</h2>
      <div className="sam-settings-group">{children}</div>
    </section>
  );
}
