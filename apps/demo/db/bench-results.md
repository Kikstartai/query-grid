Measured 2026-11-15 over 620,000 orders, 30 runs per query after 3 warm-ups; time is planning plus execution from `EXPLAIN (ANALYZE)`, in ms.

## One value per field: 80 of 80 pass

| Index | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| no filter, sort created_at (range on created_at) | first page desc | 0.81 | 0.88 | Limit → Index Scan (auto_orders_created_at) | yes |
| no filter, sort created_at (range on created_at) | deep keyset page desc | 0.94 | 1.03 | Limit → Index Scan (auto_orders_created_at) | yes |
| no filter, sort created_at (range on created_at) | first page asc | 0.79 | 0.88 | Limit → Index Scan (auto_orders_created_at) | yes |
| no filter, sort created_at (range on created_at) | deep keyset page asc | 0.96 | 1.17 | Limit → Index Scan (auto_orders_created_at) | yes |
| no filter, sort created_at (range on created_at) | capped count | 2.73 | 3.01 | Aggregate → Limit → Index Only Scan (orders_pkey) | yes |
| no filter, sort created_at (range on created_at) | capped total | 12.96 | 17.40 | Aggregate → Limit → Index Scan (auto_orders_created_at) | yes |
| no filter, sort created_at (range on created_at) | range, first page desc | 0.98 | 1.05 | Limit → Index Scan (auto_orders_created_at) | yes |
| no filter, sort created_at (range on created_at) | range, capped count | 2.70 | 2.92 | Aggregate → Limit → Index Only Scan (auto_orders_created_at) | yes |
| no filter, sort total (range on total) | first page desc | 0.82 | 0.95 | Limit → Index Scan (auto_orders_total) | yes |
| no filter, sort total (range on total) | deep keyset page desc | 0.96 | 1.03 | Limit → Index Scan (auto_orders_total) | yes |
| no filter, sort total (range on total) | first page asc | 0.81 | 0.92 | Limit → Index Scan (auto_orders_total) | yes |
| no filter, sort total (range on total) | deep keyset page asc | 0.97 | 1.08 | Limit → Index Scan (auto_orders_total) | yes |
| no filter, sort total (range on total) | capped count | 2.73 | 2.84 | Aggregate → Limit → Index Only Scan (orders_pkey) | yes |
| no filter, sort total (range on total) | capped total | 13.01 | 16.73 | Aggregate → Limit → Index Scan (auto_orders_total) | yes |
| no filter, sort total (range on total) | range, first page desc | 0.92 | 1.03 | Limit → Index Scan (auto_orders_total) | yes |
| no filter, sort total (range on total) | range, capped count | 2.74 | 2.98 | Aggregate → Limit → Index Only Scan (auto_orders_total) | yes |
| status_code =, sort created_at (range on created_at) | first page desc | 0.90 | 1.03 | Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | deep keyset page desc | 0.99 | 1.09 | Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | first page asc | 0.91 | 1.01 | Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | deep keyset page asc | 0.97 | 1.06 | Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | capped count | 4.45 | 11.68 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | capped total | 12.90 | 15.26 | Aggregate → Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | range, first page desc | 0.98 | 1.09 | Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | range, capped count | 4.51 | 4.83 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | first page desc | 0.93 | 1.07 | Limit → Index Scan (auto_orders_status_code__total) | yes |
| status_code =, sort total (range on total) | deep keyset page desc | 0.99 | 1.11 | Limit → Index Scan (auto_orders_status_code__total) | yes |
| status_code =, sort total (range on total) | first page asc | 0.95 | 1.06 | Limit → Index Scan (auto_orders_status_code__total) | yes |
| status_code =, sort total (range on total) | deep keyset page asc | 0.98 | 1.12 | Limit → Index Scan (auto_orders_status_code__total) | yes |
| status_code =, sort total (range on total) | capped count | 4.51 | 5.07 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | capped total | 12.63 | 14.55 | Aggregate → Limit → Index Scan (auto_orders_status_code__total) | yes |
| status_code =, sort total (range on total) | range, first page desc | 1.00 | 1.13 | Limit → Index Scan (auto_orders_status_code__total) | yes |
| status_code =, sort total (range on total) | range, capped count | 4.41 | 6.19 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__total) | yes |
| customer_id =, sort created_at | first page desc | 0.92 | 1.01 | Limit → Index Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | deep keyset page desc | 0.96 | 1.04 | Limit → Index Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | first page asc | 0.92 | 1.02 | Limit → Index Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | deep keyset page asc | 0.95 | 1.08 | Limit → Index Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | capped count | 2.74 | 3.08 | Aggregate → Limit → Index Only Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | capped total | 12.76 | 15.23 | Aggregate → Limit → Index Scan (auto_orders_customer_id__created_at) | yes |
| region =, sort created_at (range on created_at) | first page desc | 0.87 | 0.97 | Limit → Index Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | deep keyset page desc | 0.94 | 1.00 | Limit → Index Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | first page asc | 0.87 | 1.01 | Limit → Index Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | deep keyset page asc | 0.94 | 1.03 | Limit → Index Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | capped count | 2.78 | 2.94 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | capped total | 12.63 | 18.36 | Aggregate → Limit → Index Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | range, first page desc | 1.01 | 1.22 | Limit → Index Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | range, capped count | 2.79 | 4.74 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| channel =, sort created_at | first page desc | 0.89 | 1.04 | Limit → Index Scan (auto_orders_channel__created_at) | yes |
| channel =, sort created_at | deep keyset page desc | 0.97 | 1.17 | Limit → Index Scan (auto_orders_channel__created_at) | yes |
| channel =, sort created_at | first page asc | 0.86 | 2.05 | Limit → Index Scan (auto_orders_channel__created_at) | yes |
| channel =, sort created_at | deep keyset page asc | 0.97 | 1.09 | Limit → Index Scan (auto_orders_channel__created_at) | yes |
| channel =, sort created_at | capped count | 6.16 | 6.66 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |
| channel =, sort created_at | capped total | 13.19 | 15.65 | Aggregate → Limit → Index Scan (auto_orders_channel__created_at) | yes |
| assignee =, sort created_at (range on created_at) | first page desc | 0.92 | 1.72 | Limit → Index Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | deep keyset page desc | 0.93 | 1.21 | Limit → Index Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | first page asc | 0.92 | 1.06 | Limit → Index Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | deep keyset page asc | 0.95 | 1.13 | Limit → Index Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | capped count | 2.74 | 2.85 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | capped total | 10.34 | 11.79 | Aggregate → Limit → Index Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | range, first page desc | 0.96 | 1.06 | Limit → Index Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | range, capped count | 1.28 | 1.38 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| status_code =, region =, sort created_at | first page desc | 0.93 | 1.13 | Limit → Index Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | deep keyset page desc | 1.02 | 1.09 | Limit → Index Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | first page asc | 0.92 | 1.07 | Limit → Index Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | deep keyset page asc | 1.00 | 1.10 | Limit → Index Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | capped count | 2.89 | 3.23 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | capped total | 12.94 | 17.12 | Aggregate → Limit → Index Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, channel =, sort created_at | first page desc | 0.91 | 1.01 | Limit → Index Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | deep keyset page desc | 1.02 | 1.11 | Limit → Index Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | first page asc | 0.93 | 1.03 | Limit → Index Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | deep keyset page asc | 1.00 | 1.09 | Limit → Index Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | capped count | 2.87 | 3.09 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | capped total | 12.55 | 14.04 | Aggregate → Limit → Index Scan (auto_orders_status_code__channel__created_at) | yes |
| search over customer_name, order_number | “Smith”, capped page | 2.15 | 3.15 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search over customer_name, order_number | “Mokoena”, capped page | 7.65 | 9.10 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search over customer_name, order_number | “Zanele Dlam”, capped page | 6.80 | 9.53 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search over customer_name, order_number | “mok”, capped page | 10.93 | 11.46 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search over customer_name, order_number | “a M”, capped page | 15.96 | 16.85 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search over customer_name, order_number | “12345”, capped page | 0.52 | 0.59 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search over customer_name, order_number | “ena 4”, capped page | 9.66 | 10.36 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search over customer_name, order_number | “---”, capped page | – | – | refused by the server in 33 of 33 runs: over the 120 ms search budget | yes |

## Several values per field: 92 of 92 pass

Each ordered index with an equality field, with 2, 5 and the field's cap of values, taken from the most common and then from the rarest. The bar is the same p95 budget and no Seq Scan; a Sort is allowed here and shows in the plan, because `= ANY` over several values has no single index order to read.

| Index | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| status_code =, sort created_at (range on created_at) | 2 common status_code: first page desc | 0.87 | 0.95 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 2 common status_code: capped count | 4.32 | 4.68 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 5 common status_code: first page desc | 0.85 | 1.04 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 5 common status_code: capped count | 4.41 | 4.92 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 common status_code: first page desc | 0.86 | 0.96 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 common status_code: capped count | 4.38 | 5.33 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 2 rare status_code: first page desc | 6.30 | 6.77 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 2 rare status_code: capped count | 2.77 | 3.20 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 5 rare status_code: first page desc | 1.61 | 1.80 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 5 rare status_code: capped count | 4.40 | 4.97 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 rare status_code: first page desc | 0.86 | 0.98 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 rare status_code: capped count | 4.39 | 5.42 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 2 common status_code: first page desc | 1.01 | 1.07 | Limit → Index Scan (auto_orders_total) | yes |
| status_code =, sort total (range on total) | 2 common status_code: capped count | 4.56 | 5.66 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 5 common status_code: first page desc | 0.89 | 0.96 | Limit → Index Scan (auto_orders_total) | yes |
| status_code =, sort total (range on total) | 5 common status_code: capped count | 4.33 | 5.39 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 7 common status_code: first page desc | 0.87 | 0.95 | Limit → Index Scan (auto_orders_total) | yes |
| status_code =, sort total (range on total) | 7 common status_code: capped count | 4.43 | 10.96 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 2 rare status_code: first page desc | 7.88 | 9.25 | Limit → Index Scan (auto_orders_total) | yes |
| status_code =, sort total (range on total) | 2 rare status_code: capped count | 2.78 | 2.99 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 5 rare status_code: first page desc | 1.63 | 1.81 | Limit → Index Scan (auto_orders_total) | yes |
| status_code =, sort total (range on total) | 5 rare status_code: capped count | 4.46 | 4.93 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 7 rare status_code: first page desc | 0.90 | 1.06 | Limit → Index Scan (auto_orders_total) | yes |
| status_code =, sort total (range on total) | 7 rare status_code: capped count | 4.54 | 10.09 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| customer_id =, sort created_at | 2 common customer_id: first page desc | 5.23 | 8.84 | Limit → Index Scan (auto_orders_created_at) | yes |
| customer_id =, sort created_at | 2 common customer_id: capped count | 2.74 | 2.90 | Aggregate → Limit → Index Only Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 5 common customer_id: first page desc | 3.95 | 4.47 | Limit → Index Scan (auto_orders_created_at) | yes |
| customer_id =, sort created_at | 5 common customer_id: capped count | 2.72 | 2.81 | Aggregate → Limit → Index Only Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 20 common customer_id: first page desc | 2.71 | 3.06 | Limit → Index Scan (auto_orders_created_at) | yes |
| customer_id =, sort created_at | 20 common customer_id: capped count | 2.76 | 2.92 | Aggregate → Limit → Index Only Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 2 rare customer_id: first page desc | 0.43 | 0.48 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 2 rare customer_id: capped count | 0.33 | 0.40 | Aggregate → Limit → Index Only Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 5 rare customer_id: first page desc | 0.68 | 0.74 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 5 rare customer_id: capped count | 0.49 | 0.78 | Aggregate → Limit → Index Only Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 20 rare customer_id: first page desc | 1.55 | 1.70 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 20 rare customer_id: capped count | 1.05 | 4.15 | Aggregate → Limit → Index Only Scan (auto_orders_customer_id__created_at) | yes |
| region =, sort created_at (range on created_at) | 2 common region: first page desc | 1.23 | 1.35 | Limit → Index Scan (auto_orders_created_at) | yes |
| region =, sort created_at (range on created_at) | 2 common region: capped count | 2.75 | 3.14 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 5 common region: first page desc | 1.03 | 1.09 | Limit → Index Scan (auto_orders_created_at) | yes |
| region =, sort created_at (range on created_at) | 5 common region: capped count | 4.44 | 4.75 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 20 common region: first page desc | 0.89 | 0.97 | Limit → Index Scan (auto_orders_created_at) | yes |
| region =, sort created_at (range on created_at) | 20 common region: capped count | 3.43 | 3.63 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 2 rare region: first page desc | 15.24 | 24.80 | Limit → Index Scan (auto_orders_created_at) | yes |
| region =, sort created_at (range on created_at) | 2 rare region: capped count | 3.22 | 3.47 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 5 rare region: first page desc | 6.57 | 10.87 | Limit → Index Scan (auto_orders_created_at) | yes |
| region =, sort created_at (range on created_at) | 5 rare region: capped count | 4.09 | 4.58 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 20 rare region: first page desc | 1.75 | 1.97 | Limit → Index Scan (auto_orders_created_at) | yes |
| region =, sort created_at (range on created_at) | 20 rare region: capped count | 3.79 | 6.92 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| channel =, sort created_at | 2 common channel: first page desc | 0.86 | 1.13 | Limit → Index Scan (auto_orders_created_at) | yes |
| channel =, sort created_at | 2 common channel: capped count | 4.21 | 4.59 | Aggregate → Limit → Index Only Scan (auto_orders_channel__created_at) | yes |
| channel =, sort created_at | 5 common channel: first page desc | 0.86 | 0.99 | Limit → Index Scan (auto_orders_created_at) | yes |
| channel =, sort created_at | 5 common channel: capped count | 4.27 | 4.97 | Aggregate → Limit → Index Only Scan (auto_orders_channel__created_at) | yes |
| channel =, sort created_at | 2 rare channel: first page desc | 4.45 | 5.04 | Limit → Index Scan (auto_orders_created_at) | yes |
| channel =, sort created_at | 2 rare channel: capped count | 4.15 | 5.08 | Aggregate → Limit → Index Only Scan (auto_orders_channel__created_at) | yes |
| channel =, sort created_at | 5 rare channel: first page desc | 0.86 | 0.91 | Limit → Index Scan (auto_orders_created_at) | yes |
| channel =, sort created_at | 5 rare channel: capped count | 4.25 | 8.29 | Aggregate → Limit → Index Only Scan (auto_orders_channel__created_at) | yes |
| assignee =, sort created_at (range on created_at) | 2 common assignee: first page desc | 2.75 | 3.08 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | 2 common assignee: capped count | 2.73 | 2.86 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | 5 common assignee: first page desc | 1.80 | 1.98 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | 5 common assignee: capped count | 2.77 | 3.00 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | 5 common assignee: first page desc | 1.81 | 2.04 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | 5 common assignee: capped count | 2.75 | 2.84 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | 2 rare assignee: first page desc | 9.79 | 12.60 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | 2 rare assignee: capped count | 2.74 | 2.89 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | 5 rare assignee: first page desc | 1.80 | 2.08 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | 5 rare assignee: capped count | 2.77 | 2.94 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | 5 rare assignee: first page desc | 1.78 | 2.08 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | 5 rare assignee: capped count | 2.76 | 2.95 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| status_code =, region =, sort created_at | 2 common status_code, 2 common region: first page desc | 1.44 | 1.68 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, region =, sort created_at | 2 common status_code, 2 common region: capped count | 2.90 | 3.05 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 5 common status_code, 5 common region: first page desc | 1.10 | 1.24 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, region =, sort created_at | 5 common status_code, 5 common region: capped count | 4.59 | 8.69 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 7 common status_code, 20 common region: first page desc | 0.93 | 1.08 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, region =, sort created_at | 7 common status_code, 20 common region: capped count | 4.79 | 5.29 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 2 rare status_code, 2 rare region: first page desc | 0.95 | 1.03 | Limit → Sort → Index Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 2 rare status_code, 2 rare region: capped count | 0.54 | 0.61 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 5 rare status_code, 5 rare region: first page desc | 27.55 | 34.03 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, region =, sort created_at | 5 rare status_code, 5 rare region: capped count | 2.87 | 3.48 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 7 rare status_code, 20 rare region: first page desc | 1.79 | 1.97 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, region =, sort created_at | 7 rare status_code, 20 rare region: capped count | 5.10 | 8.79 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, channel =, sort created_at | 2 common status_code, 2 common channel: first page desc | 0.96 | 1.01 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, channel =, sort created_at | 2 common status_code, 2 common channel: capped count | 4.81 | 8.03 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 5 common status_code, 5 common channel: first page desc | 0.88 | 0.98 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, channel =, sort created_at | 5 common status_code, 5 common channel: capped count | 3.21 | 3.46 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 7 common status_code, 5 common channel: first page desc | 0.86 | 1.03 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, channel =, sort created_at | 7 common status_code, 5 common channel: capped count | 3.19 | 3.41 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 2 rare status_code, 2 rare channel: first page desc | 3.53 | 3.81 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 2 rare status_code, 2 rare channel: capped count | 0.93 | 1.07 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 5 rare status_code, 5 rare channel: first page desc | 1.64 | 1.79 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, channel =, sort created_at | 5 rare status_code, 5 rare channel: capped count | 3.20 | 3.42 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 7 rare status_code, 5 rare channel: first page desc | 0.90 | 1.09 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, channel =, sort created_at | 7 rare status_code, 5 rare channel: capped count | 3.22 | 3.68 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |

## Counts and totals from the counter table: 1 of 1 pass

One read answers the facet counts, the count and every total of a query that filters on the facet alone. The table holds one row per facet value, so the bar is the p95 budget alone.

| Index | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| status_code counters | every count and the sums of total, item_count | 0.24 | 0.31 | Seq Scan | yes |

No index is declared `multi: false`.

## Empty values: 15 of 15 pass

Each index on a nullable field, with empty, not empty, and empty beside real values, as a first page, a capped count and a capped total. The bar is the p95 budget alone: a mixed list reads through whichever plan stops first, and the plan is shown.

| Index | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| assignee =, sort created_at (range on created_at) | empty: first page desc | 0.89 | 0.97 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | empty: capped count | 2.71 | 2.97 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | empty: capped total | 15.18 | 16.68 | Aggregate → Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | not empty: first page desc | 1.66 | 2.07 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | not empty: capped count | 2.71 | 2.88 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | not empty: capped total | 3.48 | 56.84 | Aggregate → Limit → Seq Scan | yes |
| assignee =, sort created_at (range on created_at) | empty or the most common value: first page desc | 0.88 | 1.03 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | empty or the most common value: capped count | 3.38 | 3.70 | Aggregate → Limit → Seq Scan | yes |
| assignee =, sort created_at (range on created_at) | empty or the most common value: capped total | 3.60 | 6.86 | Aggregate → Limit → Seq Scan | yes |
| assignee =, sort created_at (range on created_at) | empty or the rarest value: first page desc | 0.90 | 0.98 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | empty or the rarest value: capped count | 3.35 | 3.58 | Aggregate → Limit → Seq Scan | yes |
| assignee =, sort created_at (range on created_at) | empty or the rarest value: capped total | 3.59 | 5.80 | Aggregate → Limit → Seq Scan | yes |
| assignee =, sort created_at (range on created_at) | empty or every value: first page desc | 0.84 | 1.01 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | empty or every value: capped count | 3.53 | 4.04 | Aggregate → Limit → Seq Scan | yes |
| assignee =, sort created_at (range on created_at) | empty or every value: capped total | 3.75 | 4.14 | Aggregate → Limit → Seq Scan | yes |

## Search with equality filters: 25 of 25 pass

Each term beside each filter, under the 120 ms search budget. The bar is that budget and an index scan; a run the server refuses at the budget is counted in the plan column.

| Index | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| search with status_code = completed | “Smith”, capped page | 1.80 | 2.22 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code = failed | “Smith”, capped page | 0.91 | 1.17 | Limit → Bitmap Heap Scan → BitmapAnd → Bitmap Index Scan (auto_orders_search) → Bitmap Index Scan (auto_orders_status_code__total) | yes |
| search with status_code ≠ completed | “Smith”, capped page | 1.59 | 1.71 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with region and channel, which no index pairs | “Smith”, capped page | 1.27 | 1.41 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with assignee empty | “Smith”, capped page | 1.98 | 2.13 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code = completed | “Mokoena”, capped page | 8.02 | 11.48 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code = failed | “Mokoena”, capped page | 5.44 | 5.75 | Limit → Bitmap Heap Scan → BitmapAnd → Bitmap Index Scan (auto_orders_status_code__total) → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code ≠ completed | “Mokoena”, capped page | 8.59 | 11.52 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with region and channel, which no index pairs | “Mokoena”, capped page | 14.96 | 18.92 | Limit → Bitmap Heap Scan → BitmapAnd → Bitmap Index Scan (auto_orders_search) → Bitmap Index Scan (auto_orders_region__created_at) | yes |
| search with assignee empty | “Mokoena”, capped page | 7.70 | 13.28 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code = completed | “Zanele Dlam”, capped page | 6.80 | 12.84 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code = failed | “Zanele Dlam”, capped page | 5.11 | 5.48 | Limit → Bitmap Heap Scan → BitmapAnd → Bitmap Index Scan (auto_orders_status_code__total) → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code ≠ completed | “Zanele Dlam”, capped page | 6.38 | 7.04 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with region and channel, which no index pairs | “Zanele Dlam”, capped page | 12.01 | 12.85 | Limit → Bitmap Heap Scan → BitmapAnd → Bitmap Index Scan (auto_orders_search) → Bitmap Index Scan (auto_orders_region__created_at) | yes |
| search with assignee empty | “Zanele Dlam”, capped page | 6.60 | 7.27 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code = completed | “mok”, capped page | 5.33 | 5.70 | Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| search with status_code = failed | “mok”, capped page | 9.45 | 15.07 | Limit → Bitmap Heap Scan → BitmapAnd → Bitmap Index Scan (auto_orders_status_code__total) → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code ≠ completed | “mok”, capped page | 4.83 | 5.81 | Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| search with region and channel, which no index pairs | “mok”, capped page | 13.75 | 15.32 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with assignee empty | “mok”, capped page | 5.76 | 13.37 | Limit → Index Scan (auto_orders_assignee__created_at) | yes |
| search with status_code = completed | “12345”, capped page | 0.54 | 0.64 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code = failed | “12345”, capped page | 0.69 | 0.76 | Limit → Bitmap Heap Scan → BitmapAnd → Bitmap Index Scan (auto_orders_search) → Bitmap Index Scan (auto_orders_status_code__total) | yes |
| search with status_code ≠ completed | “12345”, capped page | 0.51 | 0.58 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with region and channel, which no index pairs | “12345”, capped page | 0.51 | 0.56 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with assignee empty | “12345”, capped page | 0.51 | 0.55 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |

## Narrowed set: 5 of 5 pass

Each expensive operation, and a live GROUP BY, over the 100,000 rows `narrowLimit` allows: the newest orders, bounded on `created_at`. Each is the worst case, where nothing matches and the whole set is read. The bar is a p95 under 500 ms.

| Index | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| narrowed set of 100,000 rows | size probe: capped count of the indexed filters | 25.12 | 30.16 | Aggregate → Limit → Index Only Scan (auto_orders_created_at) | yes |
| narrowed set of 100,000 rows | contains with no match: first page | 58.37 | 67.17 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_created_at) | yes |
| narrowed set of 100,000 rows | second range with no match: first page | 0.22 | 0.26 | Limit → Sort → Index Scan (auto_orders_total) | yes |
| narrowed set of 100,000 rows | match any, sorted by another field: first page | 296.28 | 314.08 | Limit → Sort → Subquery Scan → Bitmap Heap Scan → BitmapOr → Bitmap Index Scan (auto_orders_status_code__total) → Bitmap Index Scan (auto_orders_created_at) | yes |
| narrowed set of 100,000 rows | group by region: live GROUP BY with both sums | 94.83 | 103.25 | Limit → Sort → Aggregate → Gather Merge → Sort → Aggregate → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_created_at) | yes |
