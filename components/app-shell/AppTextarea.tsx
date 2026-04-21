import type { TextareaHTMLAttributes } from "react";
import { Sam } from "@/lib/ui/sam-component-classes";

export type AppTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function AppTextarea({ className, ...rest }: AppTextareaProps) {
  return <textarea className={[Sam.input.textarea, className].filter(Boolean).join(" ")} {...rest} />;
}
