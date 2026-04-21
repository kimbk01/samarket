import type { InputHTMLAttributes } from "react";
import { Sam } from "@/lib/ui/sam-component-classes";

export type AppInputProps = InputHTMLAttributes<HTMLInputElement> & {
  soft?: boolean;
};

export function AppInput({ className, soft, ...rest }: AppInputProps) {
  const c = [Sam.input.base, soft ? Sam.input.soft : "", className ?? ""].filter(Boolean).join(" ");
  return <input className={c} {...rest} />;
}
