Measured 2026-11-15 over 620,000 orders, 30 runs per query after 3 warm-ups; time is planning plus execution from `EXPLAIN (ANALYZE)`, in ms.

## One value per field: 72 of 72 pass

| Shape | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| no filter, sort created_at (range on created_at) | first page desc | 0.80 | 0.99 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | deep keyset page desc | 0.92 | 0.99 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | first page asc | 0.83 | 1.01 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | deep keyset page asc | 0.94 | 1.10 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | capped count | 4.35 | 5.01 | Aggregate → Limit → Index Only Scan (orders_pkey) | yes |
| no filter, sort created_at (range on created_at) | capped total | 11.98 | 14.94 | Aggregate → Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | range, first page desc | 0.95 | 1.07 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | range, capped count | 3.18 | 4.24 | Aggregate → Limit → Index Only Scan (orders_qs_created_at) | yes |
| no filter, sort total (range on total) | first page desc | 0.88 | 1.15 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | deep keyset page desc | 0.95 | 1.02 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | first page asc | 0.87 | 1.01 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | deep keyset page asc | 0.94 | 1.04 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | capped count | 4.38 | 4.94 | Aggregate → Limit → Index Only Scan (orders_pkey) | yes |
| no filter, sort total (range on total) | capped total | 2.65 | 2.74 | Aggregate → Limit → Index Only Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | range, first page desc | 0.94 | 1.05 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | range, capped count | 2.68 | 2.90 | Aggregate → Limit → Index Only Scan (orders_qs_total) | yes |
| status_code =, sort created_at (range on created_at) | first page desc | 0.88 | 1.06 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | deep keyset page desc | 0.98 | 1.06 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | first page asc | 0.98 | 1.15 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | deep keyset page asc | 0.96 | 1.07 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | capped count | 4.50 | 8.91 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | capped total | 12.39 | 14.68 | Aggregate → Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | range, first page desc | 0.99 | 1.11 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | range, capped count | 4.61 | 5.25 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | first page desc | 0.99 | 1.17 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | deep keyset page desc | 1.05 | 1.16 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | first page asc | 0.97 | 1.10 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | deep keyset page asc | 0.99 | 1.14 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | capped count | 4.54 | 5.20 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | capped total | 4.56 | 4.94 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | range, first page desc | 1.02 | 1.25 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | range, capped count | 4.54 | 6.60 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__total) | yes |
| customer_id =, sort created_at | first page desc | 0.96 | 1.06 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | deep keyset page desc | 0.95 | 1.09 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | first page asc | 0.92 | 1.06 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | deep keyset page asc | 0.95 | 1.05 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | capped count | 2.78 | 3.29 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | capped total | 12.99 | 17.72 | Aggregate → Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| region =, sort created_at (range on created_at) | first page desc | 0.91 | 1.06 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | deep keyset page desc | 0.94 | 1.01 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | first page asc | 0.85 | 0.98 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | deep keyset page asc | 0.98 | 1.17 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | capped count | 2.81 | 2.96 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | capped total | 10.46 | 11.83 | Aggregate → Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | range, first page desc | 0.94 | 1.12 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | range, capped count | 2.82 | 3.07 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| channel =, sort created_at | first page desc | 0.85 | 0.99 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | deep keyset page desc | 0.97 | 1.23 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | first page asc | 0.92 | 1.06 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | deep keyset page asc | 0.95 | 1.11 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | capped count | 6.29 | 8.47 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| channel =, sort created_at | capped total | 12.24 | 14.90 | Aggregate → Limit → Index Scan (orders_qs_channel__created_at) | yes |
| status_code =, region =, sort created_at | first page desc | 0.93 | 1.04 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | deep keyset page desc | 1.01 | 1.43 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | first page asc | 0.91 | 1.09 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | deep keyset page asc | 1.00 | 1.09 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | capped count | 2.93 | 3.40 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | capped total | 11.72 | 14.75 | Aggregate → Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, channel =, sort created_at | first page desc | 0.92 | 1.04 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | deep keyset page desc | 0.99 | 1.20 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | first page asc | 0.94 | 1.10 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | deep keyset page asc | 0.99 | 1.41 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | capped count | 2.82 | 3.03 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | capped total | 12.28 | 19.36 | Aggregate → Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| quick filter over customer_name, order_number | “Smith”, capped page | 2.27 | 2.65 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “Mokoena”, capped page | 7.68 | 21.23 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “Zanele Dlam”, capped page | 6.65 | 7.12 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “mok”, capped page | 10.15 | 10.50 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “a M”, capped page | 15.06 | 16.53 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “12345”, capped page | 0.49 | 0.57 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “ena 4”, capped page | 9.50 | 10.41 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “---”, capped page | – | – | refused by the server in 33 of 33 runs: over the 120 ms quick filter budget | yes |

## Several values per field: 80 of 80 pass

Each ordered shape with an equality field, with 2, 5 and the field's cap of values, taken from the most common and then from the rarest. The bar is the same p95 budget and no Seq Scan; a Sort is allowed here and shows in the plan, because `= ANY` over several values has no single index order to read.

| Shape | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| status_code =, sort created_at (range on created_at) | 2 common status_code: first page desc | 0.87 | 1.01 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 2 common status_code: capped count | 4.43 | 4.85 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 5 common status_code: first page desc | 0.87 | 1.29 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 5 common status_code: capped count | 4.47 | 6.81 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 common status_code: first page desc | 0.85 | 0.93 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 common status_code: capped count | 4.51 | 5.13 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 2 rare status_code: first page desc | 7.36 | 9.98 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 2 rare status_code: capped count | 4.28 | 7.40 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 5 rare status_code: first page desc | 1.45 | 1.73 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 5 rare status_code: capped count | 4.64 | 5.34 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 rare status_code: first page desc | 0.91 | 1.06 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 rare status_code: capped count | 4.55 | 5.31 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 2 common status_code: first page desc | 1.06 | 1.29 | Limit → Index Scan (orders_qs_total) | yes |
| status_code =, sort total (range on total) | 2 common status_code: capped count | 4.63 | 4.99 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 5 common status_code: first page desc | 0.97 | 1.12 | Limit → Index Scan (orders_qs_total) | yes |
| status_code =, sort total (range on total) | 5 common status_code: capped count | 4.54 | 5.84 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 7 common status_code: first page desc | 0.95 | 1.25 | Limit → Index Scan (orders_qs_total) | yes |
| status_code =, sort total (range on total) | 7 common status_code: capped count | 4.54 | 5.38 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 2 rare status_code: first page desc | 8.06 | 10.14 | Limit → Index Scan (orders_qs_total) | yes |
| status_code =, sort total (range on total) | 2 rare status_code: capped count | 4.10 | 6.88 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 5 rare status_code: first page desc | 1.73 | 1.94 | Limit → Index Scan (orders_qs_total) | yes |
| status_code =, sort total (range on total) | 5 rare status_code: capped count | 4.46 | 5.00 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 7 rare status_code: first page desc | 0.96 | 1.09 | Limit → Index Scan (orders_qs_total) | yes |
| status_code =, sort total (range on total) | 7 rare status_code: capped count | 4.49 | 5.77 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| customer_id =, sort created_at | 2 common customer_id: first page desc | 5.97 | 6.98 | Limit → Index Scan (orders_qs_created_at) | yes |
| customer_id =, sort created_at | 2 common customer_id: capped count | 2.76 | 2.88 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 5 common customer_id: first page desc | 4.23 | 4.77 | Limit → Index Scan (orders_qs_created_at) | yes |
| customer_id =, sort created_at | 5 common customer_id: capped count | 2.78 | 2.94 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 20 common customer_id: first page desc | 2.77 | 3.07 | Limit → Index Scan (orders_qs_created_at) | yes |
| customer_id =, sort created_at | 20 common customer_id: capped count | 2.82 | 3.18 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 2 rare customer_id: first page desc | 0.38 | 0.46 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 2 rare customer_id: capped count | 0.34 | 0.48 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 5 rare customer_id: first page desc | 0.59 | 0.73 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 5 rare customer_id: capped count | 0.50 | 0.65 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 20 rare customer_id: first page desc | 1.55 | 1.82 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 20 rare customer_id: capped count | 1.13 | 1.35 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| region =, sort created_at (range on created_at) | 2 common region: first page desc | 1.19 | 1.40 | Limit → Index Scan (orders_qs_created_at) | yes |
| region =, sort created_at (range on created_at) | 2 common region: capped count | 2.78 | 2.96 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 5 common region: first page desc | 0.97 | 1.13 | Limit → Index Scan (orders_qs_created_at) | yes |
| region =, sort created_at (range on created_at) | 5 common region: capped count | 4.41 | 5.71 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 20 common region: first page desc | 0.86 | 0.99 | Limit → Index Scan (orders_qs_created_at) | yes |
| region =, sort created_at (range on created_at) | 20 common region: capped count | 4.49 | 4.81 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 2 rare region: first page desc | 16.45 | 21.54 | Limit → Index Scan (orders_qs_created_at) | yes |
| region =, sort created_at (range on created_at) | 2 rare region: capped count | 3.27 | 3.69 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 5 rare region: first page desc | 7.33 | 8.94 | Limit → Index Scan (orders_qs_created_at) | yes |
| region =, sort created_at (range on created_at) | 5 rare region: capped count | 4.30 | 5.69 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 20 rare region: first page desc | 1.66 | 1.89 | Limit → Index Scan (orders_qs_created_at) | yes |
| region =, sort created_at (range on created_at) | 20 rare region: capped count | 3.84 | 4.24 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| channel =, sort created_at | 2 common channel: first page desc | 0.87 | 0.98 | Limit → Index Scan (orders_qs_created_at) | yes |
| channel =, sort created_at | 2 common channel: capped count | 4.30 | 4.62 | Aggregate → Limit → Index Only Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | 5 common channel: first page desc | 0.84 | 1.08 | Limit → Index Scan (orders_qs_created_at) | yes |
| channel =, sort created_at | 5 common channel: capped count | 4.28 | 4.83 | Aggregate → Limit → Index Only Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | 2 rare channel: first page desc | 4.94 | 7.79 | Limit → Index Scan (orders_qs_created_at) | yes |
| channel =, sort created_at | 2 rare channel: capped count | 4.26 | 4.69 | Aggregate → Limit → Index Only Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | 5 rare channel: first page desc | 0.84 | 0.93 | Limit → Index Scan (orders_qs_created_at) | yes |
| channel =, sort created_at | 5 rare channel: capped count | 4.25 | 4.64 | Aggregate → Limit → Index Only Scan (orders_qs_channel__created_at) | yes |
| status_code =, region =, sort created_at | 2 common status_code, 2 common region: first page desc | 1.36 | 1.52 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, region =, sort created_at | 2 common status_code, 2 common region: capped count | 2.92 | 3.30 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 5 common status_code, 5 common region: first page desc | 1.04 | 1.15 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, region =, sort created_at | 5 common status_code, 5 common region: capped count | 4.37 | 5.41 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 7 common status_code, 20 common region: first page desc | 0.91 | 1.09 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, region =, sort created_at | 7 common status_code, 20 common region: capped count | 4.98 | 5.98 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 2 rare status_code, 2 rare region: first page desc | 0.95 | 1.09 | Limit → Sort → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 2 rare status_code, 2 rare region: capped count | 0.56 | 0.89 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 5 rare status_code, 5 rare region: first page desc | 27.15 | 33.08 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, region =, sort created_at | 5 rare status_code, 5 rare region: capped count | 3.19 | 4.37 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 7 rare status_code, 20 rare region: first page desc | 1.71 | 1.95 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, region =, sort created_at | 7 rare status_code, 20 rare region: capped count | 4.96 | 5.81 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, channel =, sort created_at | 2 common status_code, 2 common channel: first page desc | 0.95 | 1.09 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, channel =, sort created_at | 2 common status_code, 2 common channel: capped count | 4.81 | 6.66 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 5 common status_code, 5 common channel: first page desc | 0.86 | 0.99 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, channel =, sort created_at | 5 common status_code, 5 common channel: capped count | 3.21 | 5.91 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 7 common status_code, 5 common channel: first page desc | 0.89 | 0.99 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, channel =, sort created_at | 7 common status_code, 5 common channel: capped count | 3.24 | 4.04 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 2 rare status_code, 2 rare channel: first page desc | 3.61 | 4.08 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 2 rare status_code, 2 rare channel: capped count | 0.96 | 1.24 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 5 rare status_code, 5 rare channel: first page desc | 1.41 | 1.62 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, channel =, sort created_at | 5 rare status_code, 5 rare channel: capped count | 3.27 | 4.52 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 7 rare status_code, 5 rare channel: first page desc | 0.90 | 1.03 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, channel =, sort created_at | 7 rare status_code, 5 rare channel: capped count | 3.26 | 3.92 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |

No shape is declared `multi: false`.
