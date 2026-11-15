"use client";

import { Button } from "@ui-sdk/react/button";
import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/react/popover";

import type { BaseFieldDef } from "@kikstart/query-grid";

import {
  defaultColumns,
  patchColumn,
  type ColumnState,
} from "./column-state.ts";
import { ColumnsIcon, PinIcon } from "./icons.tsx";
import { useMessages } from "./messages.tsx";

export interface ColumnsMenuProps {
  fields: BaseFieldDef[];
  columns: ColumnState[];
  onColumnsChange: (columns: ColumnState[]) => void;
}

interface ColumnToggleProps {
  column: ColumnState;
  label: string;
  onPatch: (key: string, patch: Partial<ColumnState>) => void;
}

function ColumnToggle({ column, label, onPatch }: ColumnToggleProps) {
  const messages = useMessages();
  return (
    <div className="qg-column-row" data-column={column.key}>
      <label className="qg-check-label">
        <Checkbox
          checked={column.visible}
          data-column-toggle={column.key}
          onCheckedChange={(checked: boolean | "indeterminate") =>
            onPatch(column.key, { visible: checked === true })
          }
        >
          <CheckboxIndicator />
        </Checkbox>
        {label}
      </label>
      <Button
        className="qg-pin"
        aria-label={messages.pinColumn({ label })}
        aria-pressed={column.pinned}
        data-column-pin={column.key}
        onClick={() => onPatch(column.key, { pinned: !column.pinned })}
      >
        <PinIcon size={12} />
      </Button>
    </div>
  );
}

export function ColumnsMenu({
  fields,
  columns,
  onColumnsChange,
}: ColumnsMenuProps) {
  const messages = useMessages();
  const labelOf = (key: string) =>
    fields.find((field) => field.key === key)?.label ?? key;
  return (
    <Popover>
      <PopoverTrigger data-part="columns-menu-trigger">
        <ColumnsIcon />
        {messages.columns}
      </PopoverTrigger>
      <PopoverContent
        className="qg-columns-menu"
        align="end"
        data-part="columns-menu"
      >
        <PopoverTitle>{messages.columns}</PopoverTitle>
        <div className="qg-columns-list">
          {columns.map((column) => (
            <ColumnToggle
              key={column.key}
              column={column}
              label={labelOf(column.key)}
              onPatch={(key, patch) =>
                onColumnsChange(patchColumn(columns, key, patch))
              }
            />
          ))}
        </div>
        <Button
          data-columns-reset
          onClick={() => onColumnsChange(defaultColumns(fields))}
        >
          {messages.resetColumns}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
