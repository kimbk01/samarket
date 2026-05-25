"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { SearchHeader } from "@/components/layout/sector-header";

export function DeliverySearchHeader({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <SearchHeader
      value={value}
      onChange={onChange}
      onSubmit={() => onSubmit(value)}
      onBack={() => router.back()}
      placeholder={t("ui_delivery_search_input_ph")}
      inputRef={inputRef}
    />
  );
}
