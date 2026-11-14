"use client";

import { SelectItem, SelectItemIndicator } from "@ui-sdk/react/select";

interface SelectOptionProps {
  value: string;
  label: string;
  disabled?: boolean;
  reason?: string | null;
}

export function SelectOption({
  value,
  label,
  disabled,
  reason,
}: SelectOptionProps) {
  return (
    <SelectItem
      value={value}
      disabled={disabled}
      title={reason ?? undefined}
      data-option={value}
    >
      {label}
      <SelectItemIndicator />
    </SelectItem>
  );
}
