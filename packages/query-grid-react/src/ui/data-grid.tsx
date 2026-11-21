"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  createGrouping,
  encodeQuery,
  explainUnavailable,
  formatSum,
  getField,
  BLANK_GROUP,
  listSorts,
  listTotalFields,
  listFilterFields,
  listFilteredFields,
  type BaseFieldDef,
  toProblem,
  type GroupHeader,
  type Problem,
  type QueryState,
  type RowMove,
  type SortDirection,
} from "@kikstart/query-grid";

import { CardList as BaseCardList } from "../components/card-list.tsx";
import { ColumnsMenu as BaseColumnsMenu } from "../components/columns-menu.tsx";
import {
  DataGrid as BaseDataGrid,
  DataGridDefaultParts,
  type DataGridProps as BaseDataGridProps,
  type GridSelection,
} from "../components/data-grid.tsx";
import type { RowWindow } from "../components/fields.ts";
import {
  formatList,
  formatProblemMessage,
  formatRows,
  useCurrency,
  useLocale,
  formatCell,
  useMessages,
  type QueryGridMessages,
} from "../components/messages.tsx";
import { useStoreValue } from "../components/use-store-value.ts";
import { formatReason } from "../react/query-grid-format.ts";
import {
  useColumns,
  useFeedState,
  useMatchingCount,
  useOfferContext,
  useOffers,
  useQueryState,
  useReorderOffer,
} from "../react/query-grid-hooks.ts";
import {
  useQueryGridActions,
  useQueryGridMeta,
  useQueryGridState,
} from "../react/query-grid-context.tsx";
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

export type DataGridProps = Pick<
  BaseDataGridProps,
  "rowLabel" | "onRowOpen" | "rowHref" | "rowActions" | "onRowAction"
>;

export interface DataGridRootProps extends DataGridProps {
  children: ReactNode;
}

function useGridSelection() {
  const { selection } = useQueryGridState();
  const state = useStoreValue(selection.subscribe, selection.get);
  useEffect(
    () => () =>
      selection.set({ ...selection.get(), ids: [], allMatching: false }),
    [selection],
  );
  return {
    onSelectionChange: (next: GridSelection) =>
      selection.set({ ...selection.get(), ...next }),
    selectionKey: state.key,
    matchingCount: useMatchingCount(),
  };
}

interface ReorderFailure {
  problem: Problem;
  query: QueryState;
}

function useGridReorder() {
  const messages = useMessages();
  const locale = useLocale();
  const offer = useReorderOffer();
  const query = useQueryState();
  const { reorderRow } = useQueryGridActions();
  const [failure, setFailure] = useState<ReorderFailure | null>(null);
  if (!offer) {
    return {};
  }
  const problem = failure?.query === query ? failure.problem : null;
  return {
    reorder: {
      disabled: !offer.offered,
      reason: offer.reason,
      error: problem
        ? messages.reorderFailed({
            reason: formatProblemMessage(messages, problem, locale),
          })
        : null,
    },
    onRowReorder: (move: RowMove) => {
      reorderRow(move).then(
        () => setFailure(null),
        (error: unknown) => setFailure({ problem: toProblem(error), query }),
      );
    },
  };
}

function useSortReasons(): Record<string, string> {
  const { def, source } = useQueryGridMeta();
  const messages = useMessages();
  const locale = useLocale();
  const query = useQueryState();
  const context = useOfferContext();
  const offers = useOffers();
  const { sortFields, thenByFields } = source.capabilities;
  const held = [...new Set([...sortFields, ...thenByFields])].filter(
    (key) => !offers.sorts.includes(key) && !offers.thenBy.includes(key),
  );
  return Object.fromEntries(
    held.map((key) => [
      key,
      formatReason(
        messages,
        def,
        explainUnavailable(
          def,
          query,
          { kind: sortFields.includes(key) ? "sort" : "thenBy", field: key },
          context,
        ),
        locale,
      ),
    ]),
  );
}

function useGridControls() {
  const { def, source } = useQueryGridMeta();
  const query = useQueryState();
  const offers = useOffers();
  const { dispatch } = useQueryGridActions();
  const { state: columns, store } = useColumns();
  const sortReasons = useSortReasons();
  return {
    fields: def.fields,
    columns,
    onColumnsChange: store.setColumns,
    sorts: listSorts(query),
    sortableFields: offers.sorts,
    addableSortFields: offers.thenBy,
    sortReasons,
    onSortChange: (field: string, direction: SortDirection) =>
      dispatch({ type: "setSort", field, direction }),
    onSortAdd: (field: string, direction: SortDirection) =>
      dispatch({ type: "addSort", field, direction }),
    onSortRemove: (field: string) => dispatch({ type: "removeSort", field }),
    filters: Object.fromEntries(
      listFilterFields(def, source.capabilities).map((field) => [
        field.key,
        <FieldFilter key={field.key} field={field} />,
      ]),
    ),
    activeFilters: listFilteredFields(query),
  };
}

function FlatRoot({ children, ...host }: DataGridRootProps) {
  const rowWindow = useRowWindow();
  const state = useFeedState();
  const controls = useGridControls();
  const selection = useGridSelection();
  const reorder = useGridReorder();
  return (
    <BaseDataGrid.Root
      {...host}
      {...controls}
      {...rowWindow}
      {...selection}
      {...reorder}
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
  currency: string | undefined,
): string {
  if (field?.nullable && header.value === BLANK_GROUP) {
    return messages.blankValue;
  }
  if (header.label !== null) {
    return header.label;
  }
  return field
    ? formatCell(messages, field, header.value, locale, currency)
    : header.value;
}

function formatGroupSums(
  messages: QueryGridMessages,
  totals: BaseFieldDef[],
  header: GroupHeader,
  locale: string,
  currency: string | undefined,
): string | null {
  const { sums } = header;
  if (!sums || totals.length === 0) {
    return null;
  }
  return formatList(
    locale,
    totals.map(
      (field) =>
        `${messages.totalSum({ label: field.label })} ${formatSum(field, sums[field.key] ?? 0, locale, currency)}`,
    ),
    "unit",
  );
}

function GroupedRoot({ children, ...host }: DataGridRootProps) {
  const { def, source } = useQueryGridMeta();
  const query = useQueryState();
  const messages = useMessages();
  const locale = useLocale();
  const currency = useCurrency();
  const controls = useGridControls();
  const { onSelectionChange, selectionKey } = useGridSelection();
  const [grouping] = useState(() => createGrouping(def, source, query));
  const state = useStoreValue(grouping.subscribe, grouping.getState);
  const field = getField(def, query.group ?? "");
  const totals = listTotalFields(def);
  return (
    <BaseDataGrid.Root
      {...host}
      {...controls}
      onSelectionChange={onSelectionChange}
      selectionKey={selectionKey}
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
        label: formatGroupLabel(
          messages,
          field,
          group.header,
          locale,
          currency,
        ),
        count: formatRows(
          messages,
          group.header.count,
          locale,
          group.header.capped,
        ),
        detail: formatGroupSums(
          messages,
          totals,
          group.header,
          locale,
          currency,
        ),
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

function DataGridRoot({ children, ...host }: DataGridRootProps) {
  const { def } = useQueryGridMeta();
  const query = useQueryState();
  if (query.group === null) {
    return <FlatRoot {...host}>{children}</FlatRoot>;
  }
  const key = encodeQuery(def, { ...query, cursor: null }).toString();
  return (
    <GroupedRoot key={key} {...host}>
      {children}
    </GroupedRoot>
  );
}

function DefaultDataGrid(host: DataGridProps) {
  return (
    <DataGridRoot {...host}>
      <DataGridDefaultParts />
    </DataGridRoot>
  );
}

export const DataGrid = Object.assign(DefaultDataGrid, {
  Root: DataGridRoot,
  Toolbar: BaseDataGrid.Toolbar,
  Status: BaseDataGrid.Status,
  ColumnsMenu: BaseDataGrid.ColumnsMenu,
  Selection: BaseDataGrid.Selection,
  Body: BaseDataGrid.Body,
});

export function ColumnsMenu() {
  const { def } = useQueryGridMeta();
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
  const { def } = useQueryGridMeta();
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
