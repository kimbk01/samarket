import type { ReactNode } from "react";

export type AppSectionProps = {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  /** 섹션 제목에 `sam-text-section-title` 적용 */
  titleClassName?: string;
};

export function AppSection({ title, children, className, titleClassName }: AppSectionProps) {
  return (
    <section className={`flex flex-col gap-3 ${className ?? ""}`.trim()}>
      {title != null ? <h2 className={`sam-text-section-title ${titleClassName ?? ""}`.trim()}>{title}</h2> : null}
      {children}
    </section>
  );
}
