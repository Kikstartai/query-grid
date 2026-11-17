Measured 2026-11-17 over 620,000 orders, 30 runs per query after 3 warm-ups; time is planning plus execution from `EXPLAIN (ANALYZE)`, in ms.

## One value per field: 86 of 86 pass

| Index | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| no filter, sort created_at (range on created_at) | first page desc | 0.80 | 0.94 | Limit → Index Scan (auto_orders_created_at) | yes |
| no filter, sort created_at (range on created_at) | deep keyset page desc | 0.86 | 1.00 | Limit → Index Scan (auto_orders_created_at) | yes |
| no filter, sort created_at (range on created_at) | first page asc | 0.78 | 1.05 | Limit → Index Scan (auto_orders_created_at) | yes |
| no filter, sort created_at (range on created_at) | deep keyset page asc | 0.89 | 1.02 | Limit → Index Scan (auto_orders_created_at) | yes |
| no filter, sort created_at (range on created_at) | capped count | 2.75 | 3.07 | Aggregate → Limit → Index Only Scan (orders_pkey) | yes |
| no filter, sort created_at (range on created_at) | capped total | 10.39 | 15.98 | Aggregate → Limit → Index Scan (auto_orders_created_at) | yes |
| no filter, sort created_at (range on created_at) | range, first page desc | 0.96 | 1.05 | Limit → Index Scan (auto_orders_created_at) | yes |
| no filter, sort created_at (range on created_at) | range, capped count | 2.74 | 3.06 | Aggregate → Limit → Index Only Scan (auto_orders_created_at) | yes |
| no filter, sort total (range on total) | first page desc | 0.84 | 0.97 | Limit → Index Scan (auto_orders_total) | yes |
| no filter, sort total (range on total) | deep keyset page desc | 0.93 | 1.05 | Limit → Index Scan (auto_orders_total) | yes |
| no filter, sort total (range on total) | first page asc | 0.89 | 1.03 | Limit → Index Scan (auto_orders_total) | yes |
| no filter, sort total (range on total) | deep keyset page asc | 0.95 | 1.05 | Limit → Index Scan (auto_orders_total) | yes |
| no filter, sort total (range on total) | capped count | 2.77 | 2.85 | Aggregate → Limit → Index Only Scan (orders_pkey) | yes |
| no filter, sort total (range on total) | capped total | 12.03 | 16.26 | Aggregate → Limit → Index Scan (auto_orders_total) | yes |
| no filter, sort total (range on total) | range, first page desc | 0.93 | 1.25 | Limit → Index Scan (auto_orders_total) | yes |
| no filter, sort total (range on total) | range, capped count | 2.75 | 2.94 | Aggregate → Limit → Index Only Scan (auto_orders_total) | yes |
| status_code =, sort created_at (range on created_at) | first page desc | 0.90 | 1.11 | Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | deep keyset page desc | 1.00 | 1.19 | Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | first page asc | 0.89 | 1.00 | Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | deep keyset page asc | 0.99 | 1.21 | Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | capped count | 4.48 | 7.71 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | capped total | 11.64 | 14.43 | Aggregate → Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | range, first page desc | 1.00 | 1.11 | Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | range, capped count | 4.49 | 4.99 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | first page desc | 0.96 | 1.07 | Limit → Index Scan (auto_orders_status_code__total) | yes |
| status_code =, sort total (range on total) | deep keyset page desc | 1.00 | 1.13 | Limit → Index Scan (auto_orders_status_code__total) | yes |
| status_code =, sort total (range on total) | first page asc | 0.95 | 1.11 | Limit → Index Scan (auto_orders_status_code__total) | yes |
| status_code =, sort total (range on total) | deep keyset page asc | 1.00 | 6.30 | Limit → Index Scan (auto_orders_status_code__total) | yes |
| status_code =, sort total (range on total) | capped count | 4.54 | 4.89 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | capped total | 12.12 | 13.76 | Aggregate → Limit → Index Scan (auto_orders_status_code__total) | yes |
| status_code =, sort total (range on total) | range, first page desc | 1.01 | 1.18 | Limit → Index Scan (auto_orders_status_code__total) | yes |
| status_code =, sort total (range on total) | range, capped count | 4.57 | 5.22 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__total) | yes |
| customer_id =, sort created_at | first page desc | 0.97 | 1.20 | Limit → Index Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | deep keyset page desc | 0.96 | 1.11 | Limit → Index Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | first page asc | 0.91 | 1.21 | Limit → Index Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | deep keyset page asc | 0.96 | 1.14 | Limit → Index Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | capped count | 2.82 | 3.14 | Aggregate → Limit → Index Only Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | capped total | 13.36 | 18.86 | Aggregate → Limit → Index Scan (auto_orders_customer_id__created_at) | yes |
| region =, sort created_at (range on created_at) | first page desc | 0.91 | 1.03 | Limit → Index Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | deep keyset page desc | 0.95 | 1.06 | Limit → Index Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | first page asc | 0.89 | 1.12 | Limit → Index Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | deep keyset page asc | 0.97 | 1.08 | Limit → Index Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | capped count | 2.75 | 4.30 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | capped total | 12.85 | 18.39 | Aggregate → Limit → Index Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | range, first page desc | 0.97 | 1.09 | Limit → Index Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | range, capped count | 2.85 | 3.18 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| channel =, sort created_at | first page desc | 0.88 | 1.02 | Limit → Index Scan (auto_orders_channel__created_at) | yes |
| channel =, sort created_at | deep keyset page desc | 0.98 | 1.15 | Limit → Index Scan (auto_orders_channel__created_at) | yes |
| channel =, sort created_at | first page asc | 0.89 | 0.99 | Limit → Index Scan (auto_orders_channel__created_at) | yes |
| channel =, sort created_at | deep keyset page asc | 0.98 | 1.54 | Limit → Index Scan (auto_orders_channel__created_at) | yes |
| channel =, sort created_at | capped count | 5.06 | 5.63 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |
| channel =, sort created_at | capped total | 11.72 | 13.15 | Aggregate → Limit → Index Scan (auto_orders_channel__created_at) | yes |
| assignee =, sort created_at (range on created_at) | first page desc | 0.92 | 1.13 | Limit → Index Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | deep keyset page desc | 0.95 | 1.39 | Limit → Index Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | first page asc | 0.92 | 1.02 | Limit → Index Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | deep keyset page asc | 0.95 | 1.10 | Limit → Index Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | capped count | 2.74 | 2.96 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | capped total | 11.06 | 17.67 | Aggregate → Limit → Index Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | range, first page desc | 1.02 | 1.10 | Limit → Index Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | range, capped count | 1.30 | 1.43 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| status_code =, region =, sort created_at | first page desc | 0.99 | 1.16 | Limit → Index Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | deep keyset page desc | 1.02 | 1.17 | Limit → Index Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | first page asc | 0.94 | 1.15 | Limit → Index Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | deep keyset page asc | 1.01 | 2.28 | Limit → Index Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | capped count | 2.87 | 3.05 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | capped total | 13.10 | 14.85 | Aggregate → Limit → Index Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, channel =, sort created_at | first page desc | 0.91 | 1.00 | Limit → Index Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | deep keyset page desc | 1.05 | 1.20 | Limit → Index Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | first page asc | 0.90 | 1.09 | Limit → Index Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | deep keyset page asc | 1.03 | 1.17 | Limit → Index Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | capped count | 2.91 | 3.18 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | capped total | 12.46 | 13.92 | Aggregate → Limit → Index Scan (auto_orders_status_code__channel__created_at) | yes |
| no filter, sort item_count, then total | first page desc | 0.85 | 1.03 | Limit → Index Scan (auto_orders_item_count__total) | yes |
| no filter, sort item_count, then total | deep keyset page desc | 0.98 | 1.11 | Limit → Index Scan (auto_orders_item_count__total) | yes |
| no filter, sort item_count, then total | first page asc | 0.93 | 1.09 | Limit → Index Scan (auto_orders_item_count__total) | yes |
| no filter, sort item_count, then total | deep keyset page asc | 0.96 | 1.15 | Limit → Index Scan (auto_orders_item_count__total) | yes |
| no filter, sort item_count, then total | capped count | 2.72 | 2.90 | Aggregate → Limit → Index Only Scan (orders_pkey) | yes |
| no filter, sort item_count, then total | capped total | 2.99 | 3.36 | Aggregate → Limit → Index Only Scan (auto_orders_item_count__total) | yes |
| search over customer_name, order_number | “Smith”, capped page | 2.26 | 2.97 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search over customer_name, order_number | “Mokoena”, capped page | 7.82 | 9.15 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search over customer_name, order_number | “Zanele Dlam”, capped page | 6.78 | 7.92 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search over customer_name, order_number | “mok”, capped page | 11.18 | 13.58 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search over customer_name, order_number | “a M”, capped page | 16.36 | 22.93 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search over customer_name, order_number | “12345”, capped page | 0.51 | 0.56 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search over customer_name, order_number | “ena 4”, capped page | 9.69 | 12.64 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search over customer_name, order_number | “---”, capped page | – | – | refused by the server in 33 of 33 runs: over the 120 ms search budget | yes |

## Several values per field: 90 of 90 pass

Each ordered index with an equality field, with 2, 5 and the field's cap of values, taken from the most common and then from the rarest. The bar is the same p95 budget and no Seq Scan; a Sort is allowed here and shows in the plan, because `= ANY` over several values has no single index order to read.

| Index | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| status_code =, sort created_at (range on created_at) | 2 common status_code: first page desc | 0.87 | 1.05 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 2 common status_code: capped count | 4.58 | 8.47 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 5 common status_code: first page desc | 0.83 | 0.96 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 5 common status_code: capped count | 4.43 | 5.12 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 common status_code: first page desc | 0.87 | 1.00 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 common status_code: capped count | 4.49 | 4.96 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 2 rare status_code: first page desc | 7.23 | 19.78 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 2 rare status_code: capped count | 3.41 | 3.81 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__total) | yes |
| status_code =, sort created_at (range on created_at) | 5 rare status_code: first page desc | 1.76 | 2.06 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 5 rare status_code: capped count | 4.45 | 8.04 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 rare status_code: first page desc | 0.86 | 1.02 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 rare status_code: capped count | 4.44 | 5.04 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 2 common status_code: first page desc | 1.06 | 1.18 | Limit → Index Scan (auto_orders_total) | yes |
| status_code =, sort total (range on total) | 2 common status_code: capped count | 4.56 | 6.21 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 5 common status_code: first page desc | 0.95 | 1.06 | Limit → Index Scan (auto_orders_total) | yes |
| status_code =, sort total (range on total) | 5 common status_code: capped count | 4.47 | 5.18 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 7 common status_code: first page desc | 0.92 | 1.06 | Limit → Index Scan (auto_orders_total) | yes |
| status_code =, sort total (range on total) | 7 common status_code: capped count | 4.49 | 8.06 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 2 rare status_code: first page desc | 7.95 | 8.60 | Limit → Index Scan (auto_orders_total) | yes |
| status_code =, sort total (range on total) | 2 rare status_code: capped count | 3.45 | 3.72 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__total) | yes |
| status_code =, sort total (range on total) | 5 rare status_code: first page desc | 1.76 | 1.91 | Limit → Index Scan (auto_orders_total) | yes |
| status_code =, sort total (range on total) | 5 rare status_code: capped count | 4.47 | 6.17 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 7 rare status_code: first page desc | 0.92 | 1.01 | Limit → Index Scan (auto_orders_total) | yes |
| status_code =, sort total (range on total) | 7 rare status_code: capped count | 4.48 | 7.20 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| customer_id =, sort created_at | 2 common customer_id: first page desc | 6.37 | 10.39 | Limit → Index Scan (auto_orders_created_at) | yes |
| customer_id =, sort created_at | 2 common customer_id: capped count | 2.78 | 6.69 | Aggregate → Limit → Index Only Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 5 common customer_id: first page desc | 4.68 | 9.25 | Limit → Index Scan (auto_orders_created_at) | yes |
| customer_id =, sort created_at | 5 common customer_id: capped count | 2.80 | 3.05 | Aggregate → Limit → Index Only Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 20 common customer_id: first page desc | 3.00 | 3.87 | Limit → Index Scan (auto_orders_created_at) | yes |
| customer_id =, sort created_at | 20 common customer_id: capped count | 2.84 | 13.55 | Aggregate → Limit → Index Only Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 2 rare customer_id: first page desc | 0.38 | 0.45 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 2 rare customer_id: capped count | 0.32 | 0.47 | Aggregate → Limit → Index Only Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 5 rare customer_id: first page desc | 0.61 | 0.70 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 5 rare customer_id: capped count | 0.51 | 0.65 | Aggregate → Limit → Index Only Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 20 rare customer_id: first page desc | 1.47 | 1.61 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 20 rare customer_id: capped count | 1.01 | 1.35 | Aggregate → Limit → Index Only Scan (auto_orders_customer_id__created_at) | yes |
| region =, sort created_at (range on created_at) | 2 common region: first page desc | 1.26 | 1.48 | Limit → Index Scan (auto_orders_created_at) | yes |
| region =, sort created_at (range on created_at) | 2 common region: capped count | 2.78 | 3.06 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 5 common region: first page desc | 1.00 | 1.12 | Limit → Index Scan (auto_orders_created_at) | yes |
| region =, sort created_at (range on created_at) | 5 common region: capped count | 4.43 | 5.02 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 20 common region: first page desc | 0.89 | 1.03 | Limit → Index Scan (auto_orders_created_at) | yes |
| region =, sort created_at (range on created_at) | 20 common region: capped count | 3.47 | 3.62 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 2 rare region: first page desc | 17.31 | 46.80 | Limit → Index Scan (auto_orders_created_at) | yes |
| region =, sort created_at (range on created_at) | 2 rare region: capped count | 2.94 | 5.18 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 5 rare region: first page desc | 7.41 | 29.81 | Limit → Index Scan (auto_orders_created_at) | yes |
| region =, sort created_at (range on created_at) | 5 rare region: capped count | 4.27 | 4.78 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 20 rare region: first page desc | 1.81 | 2.16 | Limit → Index Scan (auto_orders_created_at) | yes |
| region =, sort created_at (range on created_at) | 20 rare region: capped count | 3.85 | 4.28 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| channel =, sort created_at | 2 common channel: first page desc | 0.86 | 0.95 | Limit → Index Scan (auto_orders_created_at) | yes |
| channel =, sort created_at | 2 common channel: capped count | 4.46 | 4.87 | Aggregate → Limit → Index Only Scan (auto_orders_channel__created_at) | yes |
| channel =, sort created_at | 5 common channel: first page desc | 0.87 | 1.03 | Limit → Index Scan (auto_orders_created_at) | yes |
| channel =, sort created_at | 5 common channel: capped count | 4.25 | 4.53 | Aggregate → Limit → Index Only Scan (auto_orders_channel__created_at) | yes |
| channel =, sort created_at | 2 rare channel: first page desc | 5.11 | 6.65 | Limit → Index Scan (auto_orders_created_at) | yes |
| channel =, sort created_at | 2 rare channel: capped count | 4.21 | 4.61 | Aggregate → Limit → Index Only Scan (auto_orders_channel__created_at) | yes |
| channel =, sort created_at | 5 rare channel: first page desc | 0.87 | 1.00 | Limit → Index Scan (auto_orders_created_at) | yes |
| channel =, sort created_at | 5 rare channel: capped count | 4.37 | 4.87 | Aggregate → Limit → Index Only Scan (auto_orders_channel__created_at) | yes |
| assignee =, sort created_at (range on created_at) | 2 common assignee: first page desc | 3.08 | 6.49 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | 2 common assignee: capped count | 2.78 | 4.58 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | 5 common assignee: first page desc | 1.91 | 2.35 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | 5 common assignee: capped count | 2.79 | 2.96 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | 6 common assignee: first page desc | 1.80 | 1.92 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | 6 common assignee: capped count | 2.81 | 4.71 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | 5 rare assignee: first page desc | 2.25 | 2.59 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | 5 rare assignee: capped count | 2.82 | 3.02 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | 6 rare assignee: first page desc | 1.82 | 2.59 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | 6 rare assignee: capped count | 2.78 | 3.93 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| status_code =, region =, sort created_at | 2 common status_code, 2 common region: first page desc | 1.47 | 1.89 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, region =, sort created_at | 2 common status_code, 2 common region: capped count | 2.90 | 3.83 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 5 common status_code, 5 common region: first page desc | 1.08 | 1.38 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, region =, sort created_at | 5 common status_code, 5 common region: capped count | 3.68 | 4.00 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 7 common status_code, 20 common region: first page desc | 0.92 | 1.12 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, region =, sort created_at | 7 common status_code, 20 common region: capped count | 4.18 | 5.62 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 2 rare status_code, 2 rare region: first page desc | 0.96 | 2.17 | Limit → Sort → Index Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 2 rare status_code, 2 rare region: capped count | 0.48 | 0.58 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 5 rare status_code, 5 rare region: first page desc | 27.06 | 35.67 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, region =, sort created_at | 5 rare status_code, 5 rare region: capped count | 2.78 | 3.31 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 7 rare status_code, 20 rare region: first page desc | 1.85 | 2.06 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, region =, sort created_at | 7 rare status_code, 20 rare region: capped count | 5.04 | 10.02 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, channel =, sort created_at | 2 common status_code, 2 common channel: first page desc | 0.95 | 1.15 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, channel =, sort created_at | 2 common status_code, 2 common channel: capped count | 4.95 | 7.05 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 5 common status_code, 5 common channel: first page desc | 0.90 | 1.18 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, channel =, sort created_at | 5 common status_code, 5 common channel: capped count | 3.29 | 5.88 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 7 common status_code, 5 common channel: first page desc | 0.86 | 1.23 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, channel =, sort created_at | 7 common status_code, 5 common channel: capped count | 3.25 | 3.51 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 2 rare status_code, 2 rare channel: first page desc | 3.55 | 3.86 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 2 rare status_code, 2 rare channel: capped count | 0.95 | 1.33 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 5 rare status_code, 5 rare channel: first page desc | 1.81 | 2.36 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, channel =, sort created_at | 5 rare status_code, 5 rare channel: capped count | 3.24 | 3.68 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 7 rare status_code, 5 rare channel: first page desc | 0.91 | 1.11 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, channel =, sort created_at | 7 rare status_code, 5 rare channel: capped count | 3.21 | 4.00 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |

## Counts and totals from the counter table: 1 of 1 pass

One read answers the facet counts, the count and every total of a query that filters on the facet alone. The table holds one row per facet value, so the bar is the p95 budget alone.

| Index | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| status_code counters | every count and the sums of total, item_count | 0.25 | 0.27 | Seq Scan | yes |

No index is declared `multi: false`.

## Empty values: 15 of 15 pass

Each index on a nullable field, with empty, not empty, and empty beside real values, as a first page, a capped count and a capped total. The bar is the p95 budget alone: a mixed list reads through whichever plan stops first, and the plan is shown.

| Index | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| assignee =, sort created_at (range on created_at) | empty: first page desc | 0.89 | 1.01 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | empty: capped count | 2.74 | 2.99 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | empty: capped total | 13.18 | 14.65 | Aggregate → Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | not empty: first page desc | 1.74 | 1.97 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | not empty: capped count | 2.74 | 3.02 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | not empty: capped total | 3.48 | 55.68 | Aggregate → Limit → Seq Scan | yes |
| assignee =, sort created_at (range on created_at) | empty or the most common value: first page desc | 0.84 | 0.91 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | empty or the most common value: capped count | 3.42 | 4.86 | Aggregate → Limit → Seq Scan | yes |
| assignee =, sort created_at (range on created_at) | empty or the most common value: capped total | 3.82 | 6.88 | Aggregate → Limit → Seq Scan | yes |
| assignee =, sort created_at (range on created_at) | empty or the rarest value: first page desc | 0.89 | 1.21 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | empty or the rarest value: capped count | 3.42 | 4.11 | Aggregate → Limit → Seq Scan | yes |
| assignee =, sort created_at (range on created_at) | empty or the rarest value: capped total | 3.78 | 13.99 | Aggregate → Limit → Seq Scan | yes |
| assignee =, sort created_at (range on created_at) | empty or every value: first page desc | 0.85 | 0.96 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | empty or every value: capped count | 3.63 | 5.30 | Aggregate → Limit → Seq Scan | yes |
| assignee =, sort created_at (range on created_at) | empty or every value: capped total | 3.92 | 4.35 | Aggregate → Limit → Seq Scan | yes |

## Search with equality filters: 25 of 25 pass

Each term beside each filter, under the 120 ms search budget. The bar is that budget and an index scan; a run the server refuses at the budget is counted in the plan column.

| Index | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| search with status_code = completed | “Smith”, capped page | 1.97 | 2.22 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code = failed | “Smith”, capped page | 0.91 | 0.98 | Limit → Bitmap Heap Scan → BitmapAnd → Bitmap Index Scan (auto_orders_search) → Bitmap Index Scan (auto_orders_status_code__total) | yes |
| search with status_code ≠ completed | “Smith”, capped page | 1.70 | 1.98 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with region and channel, which no index pairs | “Smith”, capped page | 1.36 | 1.64 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with assignee empty | “Smith”, capped page | 2.08 | 2.29 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code = completed | “Mokoena”, capped page | 8.20 | 9.26 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code = failed | “Mokoena”, capped page | 5.59 | 6.53 | Limit → Bitmap Heap Scan → BitmapAnd → Bitmap Index Scan (auto_orders_status_code__total) → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code ≠ completed | “Mokoena”, capped page | 8.67 | 10.62 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with region and channel, which no index pairs | “Mokoena”, capped page | 14.87 | 16.59 | Limit → Bitmap Heap Scan → BitmapAnd → Bitmap Index Scan (auto_orders_search) → Bitmap Index Scan (auto_orders_region__created_at) | yes |
| search with assignee empty | “Mokoena”, capped page | 7.77 | 12.38 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code = completed | “Zanele Dlam”, capped page | 6.88 | 7.64 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code = failed | “Zanele Dlam”, capped page | 5.10 | 5.95 | Limit → Bitmap Heap Scan → BitmapAnd → Bitmap Index Scan (auto_orders_status_code__total) → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code ≠ completed | “Zanele Dlam”, capped page | 6.52 | 12.71 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with region and channel, which no index pairs | “Zanele Dlam”, capped page | 6.14 | 10.16 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with assignee empty | “Zanele Dlam”, capped page | 6.71 | 41.55 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code = completed | “mok”, capped page | 5.04 | 9.02 | Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| search with status_code = failed | “mok”, capped page | 9.51 | 9.88 | Limit → Bitmap Heap Scan → BitmapAnd → Bitmap Index Scan (auto_orders_status_code__total) → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code ≠ completed | “mok”, capped page | 4.76 | 8.58 | Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| search with region and channel, which no index pairs | “mok”, capped page | 13.72 | 18.34 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with assignee empty | “mok”, capped page | 4.61 | 5.22 | Limit → Index Scan (auto_orders_assignee__created_at) | yes |
| search with status_code = completed | “12345”, capped page | 0.50 | 0.57 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code = failed | “12345”, capped page | 0.69 | 0.83 | Limit → Bitmap Heap Scan → BitmapAnd → Bitmap Index Scan (auto_orders_search) → Bitmap Index Scan (auto_orders_status_code__total) | yes |
| search with status_code ≠ completed | “12345”, capped page | 0.51 | 0.57 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with region and channel, which no index pairs | “12345”, capped page | 0.49 | 0.55 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with assignee empty | “12345”, capped page | 0.50 | 0.59 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |

## Text filters with an index of their own: 12 of 12 pass

A contains, a starts-with and an ends-with on a field in `textIndexes`, as an ordered first page and a capped count, under the 120 ms search budget. The bar is that budget and an index scan; a run the server refuses at the budget is counted in the plan column.

| Index | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| text match on customer_name | contains “Smith”, first page | 2.48 | 3.00 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_name_trgm) | yes |
| text match on customer_name | contains “Smith”, capped count | 1.32 | 1.55 | Aggregate → Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_name_trgm) | yes |
| text match on customer_name | contains “Mokoena”, first page | 11.21 | 15.24 | Limit → Index Scan (auto_orders_created_at) | yes |
| text match on customer_name | contains “Mokoena”, capped count | 18.95 | 27.41 | Aggregate → Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_name_trgm) | yes |
| text match on customer_name | contains “mok”, first page | 2.19 | 2.40 | Limit → Index Scan (auto_orders_created_at) | yes |
| text match on customer_name | contains “mok”, capped count | 16.61 | 20.46 | Aggregate → Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_name_trgm) | yes |
| text match on customer_name | starts_with “Zan”, first page | 10.94 | 12.65 | Limit → Index Scan (auto_orders_created_at) | yes |
| text match on customer_name | starts_with “Zan”, capped count | 15.85 | 19.67 | Aggregate → Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_name_trgm) | yes |
| text match on customer_name | ends_with “ena”, first page | 2.48 | 2.87 | Limit → Index Scan (auto_orders_created_at) | yes |
| text match on customer_name | ends_with “ena”, capped count | 18.86 | 20.46 | Aggregate → Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_name_trgm) | yes |
| text match on customer_name | contains “zqxjzqxj”, first page | 0.26 | 0.39 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_name_trgm) | yes |
| text match on customer_name | contains “zqxjzqxj”, capped count | 0.23 | 0.27 | Aggregate → Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_name_trgm) | yes |

## Narrowed set: 7 of 7 pass

Each expensive operation, and a live GROUP BY, over the 100,000 rows `narrowLimit` allows: the newest orders, bounded on `created_at`. Each is the worst case, where nothing matches and the whole set is read. The bar is a p95 under 500 ms.

| Index | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| narrowed set of 100,000 rows | size probe: capped count of the indexed filters | 25.21 | 31.03 | Aggregate → Limit → Index Only Scan (auto_orders_created_at) | yes |
| narrowed set of 100,000 rows | contains with no match: first page | 0.29 | 0.34 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_name_trgm) | yes |
| narrowed set of 100,000 rows | second range with no match: first page | 0.22 | 0.27 | Limit → Sort → Index Scan (auto_orders_total) | yes |
| narrowed set of 100,000 rows | match any, sorted by another field: first page | 295.63 | 327.36 | Limit → Sort → Subquery Scan → Bitmap Heap Scan → BitmapOr → Bitmap Index Scan (auto_orders_status_code__total) → Bitmap Index Scan (auto_orders_created_at) | yes |
| narrowed set of 100,000 rows | group by region: live GROUP BY with both sums | 99.38 | 116.38 | Limit → Sort → Aggregate → Gather Merge → Sort → Aggregate → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_created_at) | yes |
| narrowed set of 100,000 rows | a second sort column the other way: first page | 0.97 | 1.12 | Limit → Incremental Sort → Index Scan (auto_orders_created_at) | yes |
| narrowed set of 100,000 rows | a second sort column the other way: keyset page from the far end | 1.23 | 1.36 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_created_at) | yes |

## Export: 3 of 3 pass

An export of 50,000 rows, the most `exportLimit` allows: the count that refuses a larger one, then its first and its last keyset page of 1,000 rows. The bar is the p95 budget for each statement, read through an index.

| Index | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| export of 50,000 rows | the count that refuses an export over the limit | 12.50 | 13.45 | Aggregate → Limit → Index Only Scan (auto_orders_created_at) | yes |
| export of 50,000 rows | first page of 1,000 rows | 3.42 | 5.48 | Limit → Index Scan (auto_orders_created_at) | yes |
| export of 50,000 rows | last page of 1,000 rows, by keyset | 3.67 | 4.89 | Limit → Index Scan (auto_orders_created_at) | yes |
