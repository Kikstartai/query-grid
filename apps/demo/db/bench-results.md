Measured 2026-11-16 over 620,000 orders, 30 runs per query after 3 warm-ups; time is planning plus execution from `EXPLAIN (ANALYZE)`, in ms.

## One value per field: 80 of 80 pass

| Index | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| no filter, sort created_at (range on created_at) | first page desc | 0.85 | 0.99 | Limit → Index Scan (auto_orders_created_at) | yes |
| no filter, sort created_at (range on created_at) | deep keyset page desc | 1.03 | 1.24 | Limit → Index Scan (auto_orders_created_at) | yes |
| no filter, sort created_at (range on created_at) | first page asc | 0.79 | 0.87 | Limit → Index Scan (auto_orders_created_at) | yes |
| no filter, sort created_at (range on created_at) | deep keyset page asc | 0.97 | 1.23 | Limit → Index Scan (auto_orders_created_at) | yes |
| no filter, sort created_at (range on created_at) | capped count | 2.75 | 3.14 | Aggregate → Limit → Index Only Scan (orders_pkey) | yes |
| no filter, sort created_at (range on created_at) | capped total | 13.59 | 17.17 | Aggregate → Limit → Index Scan (auto_orders_created_at) | yes |
| no filter, sort created_at (range on created_at) | range, first page desc | 1.02 | 1.21 | Limit → Index Scan (auto_orders_created_at) | yes |
| no filter, sort created_at (range on created_at) | range, capped count | 2.77 | 2.97 | Aggregate → Limit → Index Only Scan (auto_orders_created_at) | yes |
| no filter, sort total (range on total) | first page desc | 0.83 | 0.98 | Limit → Index Scan (auto_orders_total) | yes |
| no filter, sort total (range on total) | deep keyset page desc | 1.02 | 1.30 | Limit → Index Scan (auto_orders_total) | yes |
| no filter, sort total (range on total) | first page asc | 0.82 | 1.01 | Limit → Index Scan (auto_orders_total) | yes |
| no filter, sort total (range on total) | deep keyset page asc | 0.96 | 1.19 | Limit → Index Scan (auto_orders_total) | yes |
| no filter, sort total (range on total) | capped count | 2.71 | 5.47 | Aggregate → Limit → Index Only Scan (orders_pkey) | yes |
| no filter, sort total (range on total) | capped total | 13.63 | 20.70 | Aggregate → Limit → Index Scan (auto_orders_total) | yes |
| no filter, sort total (range on total) | range, first page desc | 0.95 | 1.07 | Limit → Index Scan (auto_orders_total) | yes |
| no filter, sort total (range on total) | range, capped count | 2.76 | 2.95 | Aggregate → Limit → Index Only Scan (auto_orders_total) | yes |
| status_code =, sort created_at (range on created_at) | first page desc | 0.89 | 2.11 | Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | deep keyset page desc | 1.02 | 1.33 | Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | first page asc | 0.91 | 1.05 | Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | deep keyset page asc | 1.01 | 1.22 | Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | capped count | 4.57 | 12.06 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | capped total | 13.69 | 18.34 | Aggregate → Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | range, first page desc | 1.06 | 1.82 | Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | range, capped count | 4.53 | 5.00 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | first page desc | 0.92 | 1.02 | Limit → Index Scan (auto_orders_status_code__total) | yes |
| status_code =, sort total (range on total) | deep keyset page desc | 1.03 | 1.20 | Limit → Index Scan (auto_orders_status_code__total) | yes |
| status_code =, sort total (range on total) | first page asc | 0.95 | 1.13 | Limit → Index Scan (auto_orders_status_code__total) | yes |
| status_code =, sort total (range on total) | deep keyset page asc | 1.00 | 1.18 | Limit → Index Scan (auto_orders_status_code__total) | yes |
| status_code =, sort total (range on total) | capped count | 4.59 | 6.21 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | capped total | 13.81 | 19.09 | Aggregate → Limit → Index Scan (auto_orders_status_code__total) | yes |
| status_code =, sort total (range on total) | range, first page desc | 1.03 | 1.15 | Limit → Index Scan (auto_orders_status_code__total) | yes |
| status_code =, sort total (range on total) | range, capped count | 4.56 | 7.03 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__total) | yes |
| customer_id =, sort created_at | first page desc | 0.97 | 1.11 | Limit → Index Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | deep keyset page desc | 0.98 | 1.34 | Limit → Index Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | first page asc | 0.95 | 1.19 | Limit → Index Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | deep keyset page asc | 0.98 | 1.25 | Limit → Index Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | capped count | 2.75 | 3.67 | Aggregate → Limit → Index Only Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | capped total | 13.59 | 14.80 | Aggregate → Limit → Index Scan (auto_orders_customer_id__created_at) | yes |
| region =, sort created_at (range on created_at) | first page desc | 0.91 | 1.12 | Limit → Index Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | deep keyset page desc | 0.96 | 1.04 | Limit → Index Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | first page asc | 0.94 | 1.12 | Limit → Index Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | deep keyset page asc | 0.98 | 1.19 | Limit → Index Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | capped count | 2.77 | 2.97 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | capped total | 13.93 | 17.33 | Aggregate → Limit → Index Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | range, first page desc | 1.01 | 1.20 | Limit → Index Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | range, capped count | 2.85 | 3.15 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| channel =, sort created_at | first page desc | 0.91 | 1.01 | Limit → Index Scan (auto_orders_channel__created_at) | yes |
| channel =, sort created_at | deep keyset page desc | 1.00 | 1.11 | Limit → Index Scan (auto_orders_channel__created_at) | yes |
| channel =, sort created_at | first page asc | 0.90 | 1.07 | Limit → Index Scan (auto_orders_channel__created_at) | yes |
| channel =, sort created_at | deep keyset page asc | 1.03 | 1.11 | Limit → Index Scan (auto_orders_channel__created_at) | yes |
| channel =, sort created_at | capped count | 6.25 | 7.30 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |
| channel =, sort created_at | capped total | 13.71 | 22.10 | Aggregate → Limit → Index Scan (auto_orders_channel__created_at) | yes |
| assignee =, sort created_at (range on created_at) | first page desc | 0.93 | 1.03 | Limit → Index Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | deep keyset page desc | 0.96 | 1.21 | Limit → Index Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | first page asc | 0.94 | 1.12 | Limit → Index Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | deep keyset page asc | 0.96 | 1.07 | Limit → Index Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | capped count | 2.77 | 3.23 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | capped total | 10.45 | 18.59 | Aggregate → Limit → Index Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | range, first page desc | 1.00 | 1.08 | Limit → Index Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | range, capped count | 1.29 | 1.47 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| status_code =, region =, sort created_at | first page desc | 0.96 | 1.09 | Limit → Index Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | deep keyset page desc | 1.07 | 1.20 | Limit → Index Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | first page asc | 0.93 | 1.17 | Limit → Index Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | deep keyset page asc | 1.04 | 1.16 | Limit → Index Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | capped count | 2.93 | 3.58 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | capped total | 13.63 | 25.43 | Aggregate → Limit → Index Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, channel =, sort created_at | first page desc | 0.95 | 1.07 | Limit → Index Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | deep keyset page desc | 1.05 | 1.31 | Limit → Index Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | first page asc | 0.91 | 1.15 | Limit → Index Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | deep keyset page asc | 1.03 | 1.15 | Limit → Index Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | capped count | 2.88 | 3.44 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | capped total | 13.48 | 18.71 | Aggregate → Limit → Index Scan (auto_orders_status_code__channel__created_at) | yes |
| search over customer_name, order_number | “Smith”, capped page | 2.17 | 4.55 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search over customer_name, order_number | “Mokoena”, capped page | 7.84 | 8.54 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search over customer_name, order_number | “Zanele Dlam”, capped page | 6.68 | 7.45 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search over customer_name, order_number | “mok”, capped page | 11.10 | 19.92 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search over customer_name, order_number | “a M”, capped page | 16.37 | 18.37 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search over customer_name, order_number | “12345”, capped page | 0.51 | 0.60 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search over customer_name, order_number | “ena 4”, capped page | 9.70 | 13.84 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search over customer_name, order_number | “---”, capped page | – | – | refused by the server in 33 of 33 runs: over the 120 ms search budget | yes |

## Several values per field: 92 of 92 pass

Each ordered index with an equality field, with 2, 5 and the field's cap of values, taken from the most common and then from the rarest. The bar is the same p95 budget and no Seq Scan; a Sort is allowed here and shows in the plan, because `= ANY` over several values has no single index order to read.

| Index | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| status_code =, sort created_at (range on created_at) | 2 common status_code: first page desc | 0.89 | 1.20 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 2 common status_code: capped count | 4.60 | 4.96 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 5 common status_code: first page desc | 0.88 | 1.08 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 5 common status_code: capped count | 4.61 | 7.54 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 common status_code: first page desc | 0.88 | 1.06 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 common status_code: capped count | 4.69 | 7.85 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 2 rare status_code: first page desc | 8.07 | 12.66 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 2 rare status_code: capped count | 3.47 | 4.17 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__total) | yes |
| status_code =, sort created_at (range on created_at) | 5 rare status_code: first page desc | 1.85 | 2.13 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 5 rare status_code: capped count | 4.48 | 5.11 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 rare status_code: first page desc | 0.89 | 1.02 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 rare status_code: capped count | 4.51 | 5.10 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 2 common status_code: first page desc | 1.00 | 1.62 | Limit → Index Scan (auto_orders_total) | yes |
| status_code =, sort total (range on total) | 2 common status_code: capped count | 4.60 | 4.86 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 5 common status_code: first page desc | 0.91 | 1.07 | Limit → Index Scan (auto_orders_total) | yes |
| status_code =, sort total (range on total) | 5 common status_code: capped count | 4.47 | 6.60 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 7 common status_code: first page desc | 0.92 | 1.15 | Limit → Index Scan (auto_orders_total) | yes |
| status_code =, sort total (range on total) | 7 common status_code: capped count | 4.50 | 4.86 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 2 rare status_code: first page desc | 8.28 | 9.27 | Limit → Index Scan (auto_orders_total) | yes |
| status_code =, sort total (range on total) | 2 rare status_code: capped count | 3.50 | 3.83 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__total) | yes |
| status_code =, sort total (range on total) | 5 rare status_code: first page desc | 1.75 | 2.02 | Limit → Index Scan (auto_orders_total) | yes |
| status_code =, sort total (range on total) | 5 rare status_code: capped count | 4.43 | 5.02 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 7 rare status_code: first page desc | 0.89 | 1.08 | Limit → Index Scan (auto_orders_total) | yes |
| status_code =, sort total (range on total) | 7 rare status_code: capped count | 4.55 | 5.66 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__created_at) | yes |
| customer_id =, sort created_at | 2 common customer_id: first page desc | 6.58 | 17.22 | Limit → Index Scan (auto_orders_created_at) | yes |
| customer_id =, sort created_at | 2 common customer_id: capped count | 2.77 | 2.90 | Aggregate → Limit → Index Only Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 5 common customer_id: first page desc | 4.73 | 6.21 | Limit → Index Scan (auto_orders_created_at) | yes |
| customer_id =, sort created_at | 5 common customer_id: capped count | 2.79 | 4.23 | Aggregate → Limit → Index Only Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 20 common customer_id: first page desc | 3.19 | 3.49 | Limit → Index Scan (auto_orders_created_at) | yes |
| customer_id =, sort created_at | 20 common customer_id: capped count | 2.79 | 3.02 | Aggregate → Limit → Index Only Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 2 rare customer_id: first page desc | 0.39 | 0.46 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 2 rare customer_id: capped count | 0.33 | 0.41 | Aggregate → Limit → Index Only Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 5 rare customer_id: first page desc | 0.63 | 0.69 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 5 rare customer_id: capped count | 0.51 | 0.65 | Aggregate → Limit → Index Only Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 20 rare customer_id: first page desc | 1.61 | 1.76 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_id__created_at) | yes |
| customer_id =, sort created_at | 20 rare customer_id: capped count | 1.08 | 1.75 | Aggregate → Limit → Index Only Scan (auto_orders_customer_id__created_at) | yes |
| region =, sort created_at (range on created_at) | 2 common region: first page desc | 1.38 | 1.57 | Limit → Index Scan (auto_orders_created_at) | yes |
| region =, sort created_at (range on created_at) | 2 common region: capped count | 2.77 | 2.99 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 5 common region: first page desc | 1.10 | 1.25 | Limit → Index Scan (auto_orders_created_at) | yes |
| region =, sort created_at (range on created_at) | 5 common region: capped count | 4.46 | 4.68 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 20 common region: first page desc | 0.90 | 1.07 | Limit → Index Scan (auto_orders_created_at) | yes |
| region =, sort created_at (range on created_at) | 20 common region: capped count | 4.30 | 5.37 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 2 rare region: first page desc | 19.03 | 23.15 | Limit → Index Scan (auto_orders_created_at) | yes |
| region =, sort created_at (range on created_at) | 2 rare region: capped count | 3.28 | 4.94 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 5 rare region: first page desc | 8.07 | 9.40 | Limit → Index Scan (auto_orders_created_at) | yes |
| region =, sort created_at (range on created_at) | 5 rare region: capped count | 4.38 | 8.59 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 20 rare region: first page desc | 1.93 | 2.32 | Limit → Index Scan (auto_orders_created_at) | yes |
| region =, sort created_at (range on created_at) | 20 rare region: capped count | 3.87 | 4.25 | Aggregate → Limit → Index Only Scan (auto_orders_region__created_at) | yes |
| channel =, sort created_at | 2 common channel: first page desc | 0.92 | 1.02 | Limit → Index Scan (auto_orders_created_at) | yes |
| channel =, sort created_at | 2 common channel: capped count | 4.28 | 4.77 | Aggregate → Limit → Index Only Scan (auto_orders_channel__created_at) | yes |
| channel =, sort created_at | 5 common channel: first page desc | 0.89 | 1.08 | Limit → Index Scan (auto_orders_created_at) | yes |
| channel =, sort created_at | 5 common channel: capped count | 4.22 | 4.65 | Aggregate → Limit → Index Only Scan (auto_orders_channel__created_at) | yes |
| channel =, sort created_at | 2 rare channel: first page desc | 5.36 | 10.72 | Limit → Index Scan (auto_orders_created_at) | yes |
| channel =, sort created_at | 2 rare channel: capped count | 4.21 | 5.14 | Aggregate → Limit → Index Only Scan (auto_orders_channel__created_at) | yes |
| channel =, sort created_at | 5 rare channel: first page desc | 0.89 | 0.98 | Limit → Index Scan (auto_orders_created_at) | yes |
| channel =, sort created_at | 5 rare channel: capped count | 4.36 | 7.25 | Aggregate → Limit → Index Only Scan (auto_orders_channel__created_at) | yes |
| assignee =, sort created_at (range on created_at) | 2 common assignee: first page desc | 3.71 | 4.10 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | 2 common assignee: capped count | 2.77 | 3.07 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | 5 common assignee: first page desc | 2.04 | 2.31 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | 5 common assignee: capped count | 2.76 | 4.17 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | 6 common assignee: first page desc | 2.00 | 2.47 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | 6 common assignee: capped count | 2.81 | 5.39 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | 2 rare assignee: first page desc | 5.00 | 5.83 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | 2 rare assignee: capped count | 2.78 | 3.17 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | 5 rare assignee: first page desc | 2.35 | 3.39 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | 5 rare assignee: capped count | 2.76 | 2.99 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | 6 rare assignee: first page desc | 1.90 | 2.33 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | 6 rare assignee: capped count | 2.76 | 3.08 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| status_code =, region =, sort created_at | 2 common status_code, 2 common region: first page desc | 1.59 | 1.83 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, region =, sort created_at | 2 common status_code, 2 common region: capped count | 2.90 | 3.24 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 5 common status_code, 5 common region: first page desc | 1.13 | 1.24 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, region =, sort created_at | 5 common status_code, 5 common region: capped count | 4.48 | 5.46 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 7 common status_code, 20 common region: first page desc | 0.93 | 1.10 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, region =, sort created_at | 7 common status_code, 20 common region: capped count | 4.88 | 7.04 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 2 rare status_code, 2 rare region: first page desc | 0.98 | 1.20 | Limit → Sort → Index Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 2 rare status_code, 2 rare region: capped count | 0.57 | 1.49 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 5 rare status_code, 5 rare region: first page desc | 30.23 | 34.82 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, region =, sort created_at | 5 rare status_code, 5 rare region: capped count | 3.16 | 3.50 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 7 rare status_code, 20 rare region: first page desc | 1.97 | 2.37 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, region =, sort created_at | 7 rare status_code, 20 rare region: capped count | 4.99 | 6.01 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__region__created_at) | yes |
| status_code =, channel =, sort created_at | 2 common status_code, 2 common channel: first page desc | 1.00 | 1.25 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, channel =, sort created_at | 2 common status_code, 2 common channel: capped count | 4.81 | 7.08 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 5 common status_code, 5 common channel: first page desc | 0.89 | 1.03 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, channel =, sort created_at | 5 common status_code, 5 common channel: capped count | 3.27 | 3.54 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 7 common status_code, 5 common channel: first page desc | 0.91 | 1.12 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, channel =, sort created_at | 7 common status_code, 5 common channel: capped count | 3.25 | 3.92 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 2 rare status_code, 2 rare channel: first page desc | 3.64 | 4.16 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 2 rare status_code, 2 rare channel: capped count | 0.92 | 1.04 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 5 rare status_code, 5 rare channel: first page desc | 1.93 | 2.25 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, channel =, sort created_at | 5 rare status_code, 5 rare channel: capped count | 3.27 | 4.48 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 7 rare status_code, 5 rare channel: first page desc | 0.95 | 1.23 | Limit → Index Scan (auto_orders_created_at) | yes |
| status_code =, channel =, sort created_at | 7 rare status_code, 5 rare channel: capped count | 3.33 | 6.28 | Aggregate → Limit → Index Only Scan (auto_orders_status_code__channel__created_at) | yes |

## Counts and totals from the counter table: 1 of 1 pass

One read answers the facet counts, the count and every total of a query that filters on the facet alone. The table holds one row per facet value, so the bar is the p95 budget alone.

| Index | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| status_code counters | every count and the sums of total, item_count | 0.25 | 0.28 | Seq Scan | yes |

No index is declared `multi: false`.

## Empty values: 15 of 15 pass

Each index on a nullable field, with empty, not empty, and empty beside real values, as a first page, a capped count and a capped total. The bar is the p95 budget alone: a mixed list reads through whichever plan stops first, and the plan is shown.

| Index | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| assignee =, sort created_at (range on created_at) | empty: first page desc | 0.93 | 1.04 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | empty: capped count | 2.73 | 2.87 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | empty: capped total | 16.61 | 23.76 | Aggregate → Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | not empty: first page desc | 1.89 | 2.47 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | not empty: capped count | 2.72 | 2.91 | Aggregate → Limit → Index Only Scan (auto_orders_assignee__created_at) | yes |
| assignee =, sort created_at (range on created_at) | not empty: capped total | 3.36 | 55.37 | Aggregate → Limit → Seq Scan | yes |
| assignee =, sort created_at (range on created_at) | empty or the most common value: first page desc | 0.88 | 0.97 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | empty or the most common value: capped count | 3.31 | 3.49 | Aggregate → Limit → Seq Scan | yes |
| assignee =, sort created_at (range on created_at) | empty or the most common value: capped total | 3.58 | 6.55 | Aggregate → Limit → Seq Scan | yes |
| assignee =, sort created_at (range on created_at) | empty or the rarest value: first page desc | 0.93 | 1.05 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | empty or the rarest value: capped count | 3.33 | 3.77 | Aggregate → Limit → Seq Scan | yes |
| assignee =, sort created_at (range on created_at) | empty or the rarest value: capped total | 3.69 | 16.10 | Aggregate → Limit → Seq Scan | yes |
| assignee =, sort created_at (range on created_at) | empty or every value: first page desc | 0.92 | 1.06 | Limit → Index Scan (auto_orders_created_at) | yes |
| assignee =, sort created_at (range on created_at) | empty or every value: capped count | 3.66 | 6.33 | Aggregate → Limit → Seq Scan | yes |
| assignee =, sort created_at (range on created_at) | empty or every value: capped total | 3.86 | 4.46 | Aggregate → Limit → Seq Scan | yes |

## Search with equality filters: 25 of 25 pass

Each term beside each filter, under the 120 ms search budget. The bar is that budget and an index scan; a run the server refuses at the budget is counted in the plan column.

| Index | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| search with status_code = completed | “Smith”, capped page | 1.80 | 2.03 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code = failed | “Smith”, capped page | 0.91 | 1.01 | Limit → Bitmap Heap Scan → BitmapAnd → Bitmap Index Scan (auto_orders_search) → Bitmap Index Scan (auto_orders_status_code__total) | yes |
| search with status_code ≠ completed | “Smith”, capped page | 1.59 | 1.75 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with region and channel, which no index pairs | “Smith”, capped page | 1.31 | 1.42 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with assignee empty | “Smith”, capped page | 1.97 | 2.19 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code = completed | “Mokoena”, capped page | 8.42 | 9.51 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code = failed | “Mokoena”, capped page | 5.51 | 7.97 | Limit → Bitmap Heap Scan → BitmapAnd → Bitmap Index Scan (auto_orders_status_code__total) → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code ≠ completed | “Mokoena”, capped page | 8.60 | 11.67 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with region and channel, which no index pairs | “Mokoena”, capped page | 15.26 | 19.61 | Limit → Bitmap Heap Scan → BitmapAnd → Bitmap Index Scan (auto_orders_search) → Bitmap Index Scan (auto_orders_region__created_at) | yes |
| search with assignee empty | “Mokoena”, capped page | 7.69 | 8.64 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code = completed | “Zanele Dlam”, capped page | 6.85 | 11.42 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code = failed | “Zanele Dlam”, capped page | 5.10 | 5.43 | Limit → Bitmap Heap Scan → BitmapAnd → Bitmap Index Scan (auto_orders_status_code__total) → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code ≠ completed | “Zanele Dlam”, capped page | 6.39 | 7.64 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with region and channel, which no index pairs | “Zanele Dlam”, capped page | 5.99 | 27.96 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with assignee empty | “Zanele Dlam”, capped page | 6.66 | 6.99 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code = completed | “mok”, capped page | 5.70 | 6.03 | Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| search with status_code = failed | “mok”, capped page | 9.52 | 13.15 | Limit → Bitmap Heap Scan → BitmapAnd → Bitmap Index Scan (auto_orders_status_code__total) → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code ≠ completed | “mok”, capped page | 4.93 | 5.29 | Limit → Index Scan (auto_orders_status_code__created_at) | yes |
| search with region and channel, which no index pairs | “mok”, capped page | 13.73 | 15.87 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with assignee empty | “mok”, capped page | 5.51 | 9.73 | Limit → Index Scan (auto_orders_assignee__created_at) | yes |
| search with status_code = completed | “12345”, capped page | 0.50 | 0.68 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with status_code = failed | “12345”, capped page | 0.68 | 0.76 | Limit → Bitmap Heap Scan → BitmapAnd → Bitmap Index Scan (auto_orders_search) → Bitmap Index Scan (auto_orders_status_code__total) | yes |
| search with status_code ≠ completed | “12345”, capped page | 0.52 | 0.58 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with region and channel, which no index pairs | “12345”, capped page | 0.49 | 0.59 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |
| search with assignee empty | “12345”, capped page | 0.50 | 0.62 | Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_search) | yes |

## Text filters with an index of their own: 12 of 12 pass

A contains, a starts-with and an ends-with on a field in `textIndexes`, as an ordered first page and a capped count, under the 120 ms search budget. The bar is that budget and an index scan; a run the server refuses at the budget is counted in the plan column.

| Index | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| text match on customer_name | contains “Smith”, first page | 2.35 | 2.61 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_name_trgm) | yes |
| text match on customer_name | contains “Smith”, capped count | 1.19 | 1.35 | Aggregate → Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_name_trgm) | yes |
| text match on customer_name | contains “Mokoena”, first page | 11.95 | 13.72 | Limit → Index Scan (auto_orders_created_at) | yes |
| text match on customer_name | contains “Mokoena”, capped count | 18.09 | 22.58 | Aggregate → Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_name_trgm) | yes |
| text match on customer_name | contains “mok”, first page | 2.34 | 3.05 | Limit → Index Scan (auto_orders_created_at) | yes |
| text match on customer_name | contains “mok”, capped count | 16.50 | 20.17 | Aggregate → Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_name_trgm) | yes |
| text match on customer_name | starts_with “Zan”, first page | 12.17 | 17.16 | Limit → Index Scan (auto_orders_created_at) | yes |
| text match on customer_name | starts_with “Zan”, capped count | 15.28 | 17.98 | Aggregate → Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_name_trgm) | yes |
| text match on customer_name | ends_with “ena”, first page | 2.55 | 6.83 | Limit → Index Scan (auto_orders_created_at) | yes |
| text match on customer_name | ends_with “ena”, capped count | 18.75 | 24.17 | Aggregate → Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_name_trgm) | yes |
| text match on customer_name | contains “zqxjzqxj”, first page | 0.27 | 0.37 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_name_trgm) | yes |
| text match on customer_name | contains “zqxjzqxj”, capped count | 0.24 | 0.27 | Aggregate → Limit → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_name_trgm) | yes |

## Narrowed set: 5 of 5 pass

Each expensive operation, and a live GROUP BY, over the 100,000 rows `narrowLimit` allows: the newest orders, bounded on `created_at`. Each is the worst case, where nothing matches and the whole set is read. The bar is a p95 under 500 ms.

| Index | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| narrowed set of 100,000 rows | size probe: capped count of the indexed filters | 24.98 | 27.34 | Aggregate → Limit → Index Only Scan (auto_orders_created_at) | yes |
| narrowed set of 100,000 rows | contains with no match: first page | 0.30 | 0.36 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_customer_name_trgm) | yes |
| narrowed set of 100,000 rows | second range with no match: first page | 0.23 | 0.27 | Limit → Sort → Index Scan (auto_orders_total) | yes |
| narrowed set of 100,000 rows | match any, sorted by another field: first page | 300.70 | 330.38 | Limit → Sort → Subquery Scan → Bitmap Heap Scan → BitmapOr → Bitmap Index Scan (auto_orders_status_code__total) → Bitmap Index Scan (auto_orders_created_at) | yes |
| narrowed set of 100,000 rows | group by region: live GROUP BY with both sums | 90.19 | 103.64 | Limit → Sort → Aggregate → Gather Merge → Sort → Aggregate → Bitmap Heap Scan → Bitmap Index Scan (auto_orders_created_at) | yes |
