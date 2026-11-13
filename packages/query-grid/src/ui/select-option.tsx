"use client";

import { SelectItem, SelectItemIndicator } from "@ui-sdk/react/select";

import { CheckIcon } from "./icons.tsx";

interface SelectOptionProps {
  value: string;
  label: string;
  disabled?: boolean;
}

export function SelectOption({ value, label, disabled }: SelectOptionProps) {
  return (
    <SelectItem
      className="qg-option"
      value={value}
      disabled={disabled}
      data-option={value}
    >
      {label}
      <SelectItemIndicator className="qg-option-indicator">
        <CheckIcon />
      </SelectItemIndicator>
    </SelectItem>
  );
}
