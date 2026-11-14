"use client";

import { SelectItem, SelectItemIndicator } from "@ui-sdk/react/select";

interface SelectOptionProps {
  value: string;
  label: string;
  disabled?: boolean;
}

export function SelectOption({ value, label, disabled }: SelectOptionProps) {
  return (
    <SelectItem value={value} disabled={disabled} data-option={value}>
      {label}
      <SelectItemIndicator />
    </SelectItem>
  );
}
