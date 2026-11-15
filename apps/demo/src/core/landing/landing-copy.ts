interface Principle {
  title: string;
  body: string;
}

export const PRINCIPLES: Principle[] = [
  {
    title: "The UI reflects what the data layer can do",
    body: "A filter, a sort or a combination of the two is offered only when an index answers it fast. The server refuses any other with a 400.",
  },
  {
    title: "Composition, not a monolith",
    body: "The filter bar, sidebar, chips, facets, count, total, grid, list and board are separate parts around one query state. None owns it.",
  },
  {
    title: "Very large data sets are never a constraint",
    body: "Sorting and filtering happen in Postgres over indexes, paging is keyset, and the browser renders only the visible window.",
  },
];
