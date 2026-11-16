"use client";

import { useState, type ReactNode } from "react";

import {
  createGrouping,
  encodeQuery,
  formatSum,
  formatValue,
  getField,
  getReservedValue,
  listTotalFields,
  resolveFilterKind,
  type BaseFieldDef,
  type GroupHeader,
  type SortDirection,
} from "@kikstart/query-grid";

import { CardList as BaseCardList } from "../components/card-list.tsx";
import { ColumnsMenu as BaseColumnsMenu } from "../components/columns-menu.tsx";
import {
  DataGrid as BaseDataGrid,
  DataGridDefaultParts,
} from "../components/data-grid.tsx";
import type { RowWindow } from "../components/fields.ts";
import {
  formatList,
  formatProblemMessage,
  formatReservedValue,
  formatRows,
  useLocale,
  useMessages,
  type QueryGridMessages,
} from "../components/messages.tsx";
import { useStoreValue } from "../components/use-store-value.ts";
import {
  useColumns,
  useFeedState,
  useOffers,
  useQueryGrid,
  useQueryGridActions,
  useQueryState,
} from "../react/query-grid-provider.tsx";
import { FieldFilter } from "./filters.tsx";

function useRowWindow(): RowWindow {
  const { loadMore } = useQueryGridActions();
  const messages = useMessages();
  const locale = useLocale();
  const state = useFeedState();
  return {
    rows: state.rows,
    hasNext: state.hasNext,
    onEndReached: loadMore,
    loading: state.status === "loading",
    error: state.error
      ? formatProblemMessage(messages, state.error, locale)
      : null,
    pages: state.pages,
  };
}

export interface DataGridRootProps {
  children: ReactNode;
}

function useGridControls() {
  const { def, source } = useQueryGrid();
  const query = useQueryState();
  const offers = useOffers();
  const { dispatch } = useQueryGridActions();
  const { state: columns, store } = useColumns();
  return {
    fields: def.fields,
    columns,
    onColumnsChange: store.setColumns,
    sort: query.sort,
    sortableFields: offers.sorts,
    onSortChange: (field: string, direction: SortDirection) =>
      dispatch({ type: "setSort", field, direction }),
    filters: Object.fromEntries(
      def.fields
        .filter(
          (field) => resolveFilterKind(field, source.capabilities) !== null,
        )
        .map((field) => [
          field.key,
          <FieldFilter key={field.key} field={field} />,
        ]),
    ),
    activeFilters: [
      ...Object.keys(query.equals),
      ...query.ranges.map((range) => range.field),
      ...(query.contains ? [query.contains.field] : []),
    ],
  };
}

function FlatRoot({ children }: DataGridRootProps) {
  const rowWindow = useRowWindow();
  const state = useFeedState();
  const controls = useGridControls();
  return (
    <BaseDataGrid.Root
      {...controls}
      {...rowWindow}
      capped={state.capped}
      resetKey={state.query}
    >
      {children}
    </BaseDataGrid.Root>
  );
}

function ignoreEnd(): void {
  return;
}

function formatGroupLabel(
  messages: QueryGridMessages,
  field: BaseFieldDef | null,
  header: GroupHeader,
  locale: string,
): string {
  const reserved = field ? getReservedValue(field, header.value) : null;
  if (reserved) {
    return formatReservedValue(messages, reserved);
  }
  if (header.label !== null) {
    return header.label;
  }
  return field ? formatValue(field, header.value, locale) : header.value;
}

function formatGroupSums(
  messages: QueryGridMessages,
  totals: BaseFieldDef[],
  header: GroupHeader,
  locale: string,
): string | null {
  const { sums } = header;
  if (!sums || totals.length === 0) {
    return null;
  }
  return formatList(
    locale,
    totals.map(
      (field) =>
        `${messages.totalSum({ label: field.label })} ${formatSum(field, sums[field.key] ?? 0, locale)}`,
    ),
    "unit",
  );
}

function GroupedRoot({ children }: DataGridRootProps) {
  const { def, source } = useQueryGrid();
  const query = useQueryState();
  const messages = useMessages();
  const locale = useLocale();
  const controls = useGridControls();
  const [grouping] = useState(() => createGrouping(def, source, query));
  const state = useStoreValue(grouping.subscribe, grouping.getState);
  const field = getField(def, query.group ?? "");
  const totals = listTotalFields(def);
  return (
    <BaseDataGrid.Root
      {...controls}
      rows={[]}
      hasNext={false}
      onEndReached={ignoreEnd}
      loading={state.status === "loading"}
      pages={state.loaded ? undefined : 0}
      error={
        state.error ? formatProblemMessage(messages, state.error, locale) : null
      }
      capped={state.truncated}
      resetKey={grouping}
      groups={state.groups.map((group) => ({
        key: group.header.value,
        label: formatGroupLabel(messages, field, group.header, locale),
        count: formatRows(
          messages,
          group.header.count,
          locale,
          group.header.capped,
        ),
        detail: formatGroupSums(messages, totals, group.header, locale),
        expanded: group.expanded,
        rows: group.rows,
        hasNext: group.hasNext,
        loading: group.status === "loading",
        error: group.error
          ? formatProblemMessage(messages, group.error, locale)
          : null,
      }))}
      onGroupToggle={grouping.toggle}
      onGroupLoadMore={grouping.loadMore}
    >
      {children}
    </BaseDataGrid.Root>
  );
}

function DataGridRoot({ children }: DataGridRootProps) {
  const { def } = useQueryGrid();
  const query = useQueryState();
  if (query.group === null) {
    return <FlatRoot>{children}</FlatRoot>;
  }
  const key = encodeQuery(def, { ...query, cursor: null }).toString();
  return <GroupedRoot key={key}>{children}</GroupedRoot>;
}

function DefaultDataGrid() {
  return (
    <DataGridRoot>
      <DataGridDefaultParts />
    </DataGridRoot>
  );
}

export const DataGrid = Object.assign(DefaultDataGrid, {
  Root: DataGridRoot,
  Toolbar: BaseDataGrid.Toolbar,
  Status: BaseDataGrid.Status,
  ColumnsMenu: BaseDataGrid.ColumnsMenu,
  Body: BaseDataGrid.Body,
});

export function ColumnsMenu() {
  const { def } = useQueryGrid();
  const { state, store } = useColumns();
  return (
    <BaseColumnsMenu
      fields={def.fields}
      columns={state}
      onColumnsChange={store.setColumns}
    />
  );
}

export interface CardListProps {
  titleField: string;
  badgeField: string;
}

export function CardList({ titleField, badgeField }: CardListProps) {
  const { def } = useQueryGrid();
  const rowWindow = useRowWindow();
  return (
    <BaseCardList
      fields={def.fields}
      {...rowWindow}
      titleField={titleField}
      badgeField={badgeField}
    />
  );
}
