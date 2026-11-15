"use client";

import type { ReactNode } from "react";

import { CardList as BaseCardList } from "../components/card-list.tsx";
import { ColumnsMenu as BaseColumnsMenu } from "../components/columns-menu.tsx";
import {
  DataGrid as BaseDataGrid,
  DataGridDefaultParts,
} from "../components/data-grid.tsx";
import type { RowWindow } from "../components/fields.ts";
import {
  formatProblemMessage,
  useLocale,
  useMessages,
} from "../components/messages.tsx";
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

function DataGridRoot({ children }: DataGridRootProps) {
  const { def } = useQueryGrid();
  const rowWindow = useRowWindow();
  const state = useFeedState();
  const query = useQueryState();
  const offers = useOffers();
  const { dispatch } = useQueryGridActions();
  const { state: columns, store } = useColumns();
  return (
    <BaseDataGrid.Root
      fields={def.fields}
      {...rowWindow}
      capped={state.capped}
      resetKey={state.query}
      columns={columns}
      onColumnsChange={store.setColumns}
      sort={query.sort}
      sortableFields={offers.sorts}
      onSortChange={(field, direction) =>
        dispatch({ type: "setSort", field, direction })
      }
      filters={Object.fromEntries(
        def.fields
          .filter(
            (field) =>
              offers.equals.includes(field.key) ||
              offers.ranges.includes(field.key),
          )
          .map((field) => [
            field.key,
            <FieldFilter key={field.key} field={field} />,
          ]),
      )}
      activeFilters={[
        ...Object.keys(query.equals),
        ...query.ranges.map((range) => range.field),
        ...(query.contains ? [query.contains.field] : []),
      ]}
    >
      {children}
    </BaseDataGrid.Root>
  );
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
