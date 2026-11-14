"use client";

import { CardList as BaseCardList } from "../components/card-list.tsx";
import { ColumnsMenu as BaseColumnsMenu } from "../components/columns-menu.tsx";
import { DataGrid as BaseDataGrid } from "../components/data-grid.tsx";
import { formatProblemMessage, useMessages } from "../components/messages.tsx";
import {
  useColumns,
  useFeedState,
  useOffers,
  useQueryDispatch,
  useQueryGrid,
  useQueryState,
} from "../react/query-grid-provider.tsx";
import { FieldFilter } from "./filters.tsx";

export function DataGrid() {
  const { def, feed } = useQueryGrid();
  const messages = useMessages();
  const state = useFeedState();
  const query = useQueryState();
  const offers = useOffers();
  const dispatch = useQueryDispatch();
  const { state: columns, store } = useColumns();
  return (
    <BaseDataGrid
      fields={def.fields}
      rows={state.rows}
      hasNext={state.hasNext}
      onEndReached={feed.loadMore}
      loading={state.status === "loading"}
      error={
        state.error
          ? formatProblemMessage(messages, state.error, def.format)
          : null
      }
      capped={state.capped}
      pages={state.pages}
      format={def.format}
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
        ...(query.range ? [query.range.field] : []),
      ]}
    />
  );
}

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
  const { def, feed } = useQueryGrid();
  const messages = useMessages();
  const state = useFeedState();
  return (
    <BaseCardList
      fields={def.fields}
      rows={state.rows}
      hasNext={state.hasNext}
      onEndReached={feed.loadMore}
      loading={state.status === "loading"}
      error={
        state.error
          ? formatProblemMessage(messages, state.error, def.format)
          : null
      }
      pages={state.pages}
      titleField={titleField}
      badgeField={badgeField}
      format={def.format}
    />
  );
}
