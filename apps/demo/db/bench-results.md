Measured 2026-11-14 over 620,000 orders, 30 runs per query after 3 warm-ups; time is planning plus execution from `EXPLAIN (ANALYZE)`, in ms.

## One value per field: 72 of 72 pass

| Shape | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| no filter, sort created_at (range on created_at) | first page desc | 0.79 | 0.86 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | deep keyset page desc | 0.91 | 1.02 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | first page asc | 0.76 | 0.82 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | deep keyset page asc | 0.94 | 1.00 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | capped count | 2.58 | 2.65 | Aggregate → Limit → Index Only Scan (orders_pkey) | yes |
| no filter, sort created_at (range on created_at) | capped total | 11.22 | 15.44 | Aggregate → Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | range, first page desc | 0.92 | 1.01 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | range, capped count | 3.15 | 3.40 | Aggregate → Limit → Index Only Scan (orders_qs_created_at) | yes |
| no filter, sort total (range on total) | first page desc | 0.80 | 0.86 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | deep keyset page desc | 0.93 | 1.02 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | first page asc | 0.79 | 0.84 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | deep keyset page asc | 0.92 | 0.99 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | capped count | 2.58 | 2.81 | Aggregate → Limit → Index Only Scan (orders_pkey) | yes |
| no filter, sort total (range on total) | capped total | 2.60 | 2.76 | Aggregate → Limit → Index Only Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | range, first page desc | 0.91 | 0.95 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | range, capped count | 2.69 | 2.92 | Aggregate → Limit → Index Only Scan (orders_qs_total) | yes |
| status_code =, sort created_at (range on created_at) | first page desc | 0.88 | 0.97 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | deep keyset page desc | 0.98 | 1.03 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | first page asc | 0.89 | 0.97 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | deep keyset page asc | 0.95 | 1.05 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | capped count | 4.30 | 5.20 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | capped total | 11.57 | 13.23 | Aggregate → Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | range, first page desc | 0.98 | 1.06 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | range, capped count | 4.38 | 4.76 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | first page desc | 0.90 | 1.00 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | deep keyset page desc | 0.99 | 1.11 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | first page asc | 0.90 | 1.02 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | deep keyset page asc | 0.95 | 1.04 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | capped count | 4.31 | 4.83 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | capped total | 4.49 | 4.75 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | range, first page desc | 1.02 | 1.09 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | range, capped count | 4.37 | 6.01 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__total) | yes |
| customer_id =, sort created_at | first page desc | 0.94 | 1.06 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | deep keyset page desc | 0.91 | 1.03 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | first page asc | 0.95 | 1.20 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | deep keyset page asc | 0.97 | 1.14 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | capped count | 2.72 | 2.96 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | capped total | 12.23 | 18.07 | Aggregate → Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| region =, sort created_at (range on created_at) | first page desc | 0.86 | 1.13 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | deep keyset page desc | 0.93 | 1.02 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | first page asc | 0.87 | 0.92 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | deep keyset page asc | 0.92 | 1.00 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | capped count | 2.75 | 2.99 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | capped total | 11.78 | 13.36 | Aggregate → Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | range, first page desc | 0.97 | 1.04 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | range, capped count | 2.77 | 2.92 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| channel =, sort created_at | first page desc | 0.88 | 0.99 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | deep keyset page desc | 0.95 | 1.05 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | first page asc | 0.86 | 0.95 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | deep keyset page asc | 0.95 | 1.05 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | capped count | 6.03 | 6.58 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| channel =, sort created_at | capped total | 10.43 | 12.28 | Aggregate → Limit → Index Scan (orders_qs_channel__created_at) | yes |
| status_code =, region =, sort created_at | first page desc | 0.92 | 1.05 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | deep keyset page desc | 1.00 | 1.07 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | first page asc | 0.91 | 1.02 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | deep keyset page asc | 0.99 | 1.04 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | capped count | 2.89 | 3.17 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | capped total | 11.92 | 13.17 | Aggregate → Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, channel =, sort created_at | first page desc | 0.93 | 1.00 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | deep keyset page desc | 0.99 | 1.21 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | first page asc | 0.90 | 1.00 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | deep keyset page asc | 1.01 | 1.22 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | capped count | 2.82 | 3.05 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | capped total | 11.29 | 14.12 | Aggregate → Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| quick filter over customer_name, order_number | “Smith”, capped page | 2.19 | 2.40 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “Mokoena”, capped page | 7.32 | 7.84 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “Zanele Dlam”, capped page | 6.46 | 6.73 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “mok”, capped page | 9.96 | 10.56 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “a M”, capped page | 14.91 | 19.50 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “12345”, capped page | 0.46 | 0.51 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “ena 4”, capped page | 9.49 | 10.13 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “---”, capped page | – | – | refused by the server in 33 of 33 runs: over the 120 ms quick filter budget | yes |

## Several values per field: 80 of 80 pass

Each ordered shape with an equality field, with 2, 5 and the field's cap of values, taken from the most common and then from the rarest. The bar is the same p95 budget and no Seq Scan; a Sort is allowed here and shows in the plan, because `= ANY` over several values has no single index order to read.

| Shape | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| status_code =, sort created_at (range on created_at) | 2 common status_code: first page desc | 0.88 | 1.01 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 2 common status_code: capped count | 4.33 | 4.79 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 5 common status_code: first page desc | 0.85 | 0.94 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 5 common status_code: capped count | 4.29 | 4.79 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 common status_code: first page desc | 0.85 | 1.18 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 common status_code: capped count | 4.32 | 4.73 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 2 rare status_code: first page desc | 6.82 | 8.38 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 2 rare status_code: capped count | 3.41 | 3.65 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__total) | yes |
| status_code =, sort created_at (range on created_at) | 5 rare status_code: first page desc | 1.56 | 1.66 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 5 rare status_code: capped count | 4.38 | 4.63 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__total) | yes |
| status_code =, sort created_at (range on created_at) | 7 rare status_code: first page desc | 0.85 | 0.94 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 rare status_code: capped count | 4.31 | 4.60 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 2 common status_code: first page desc | 0.99 | 1.06 | Limit → Index Scan (orders_qs_total) | yes |
| status_code =, sort total (range on total) | 2 common status_code: capped count | 4.40 | 4.92 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 5 common status_code: first page desc | 0.87 | 0.92 | Limit → Index Scan (orders_qs_total) | yes |
| status_code =, sort total (range on total) | 5 common status_code: capped count | 4.29 | 5.38 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 7 common status_code: first page desc | 0.87 | 1.13 | Limit → Index Scan (orders_qs_total) | yes |
| status_code =, sort total (range on total) | 7 common status_code: capped count | 4.38 | 4.70 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 2 rare status_code: first page desc | 7.51 | 8.18 | Limit → Index Scan (orders_qs_total) | yes |
| status_code =, sort total (range on total) | 2 rare status_code: capped count | 3.39 | 3.94 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | 5 rare status_code: first page desc | 1.64 | 1.95 | Limit → Index Scan (orders_qs_total) | yes |
| status_code =, sort total (range on total) | 5 rare status_code: capped count | 4.29 | 4.85 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | 7 rare status_code: first page desc | 0.88 | 0.97 | Limit → Index Scan (orders_qs_total) | yes |
| status_code =, sort total (range on total) | 7 rare status_code: capped count | 4.26 | 4.54 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| customer_id =, sort created_at | 2 common customer_id: first page desc | 5.66 | 7.17 | Limit → Index Scan (orders_qs_created_at) | yes |
| customer_id =, sort created_at | 2 common customer_id: capped count | 2.71 | 2.92 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 5 common customer_id: first page desc | 4.21 | 4.52 | Limit → Index Scan (orders_qs_created_at) | yes |
| customer_id =, sort created_at | 5 common customer_id: capped count | 2.74 | 3.11 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 20 common customer_id: first page desc | 2.89 | 3.37 | Limit → Index Scan (orders_qs_created_at) | yes |
| customer_id =, sort created_at | 20 common customer_id: capped count | 2.77 | 3.09 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 2 rare customer_id: first page desc | 0.35 | 0.38 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 2 rare customer_id: capped count | 0.30 | 0.40 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 5 rare customer_id: first page desc | 0.57 | 0.61 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 5 rare customer_id: capped count | 0.48 | 0.59 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 20 rare customer_id: first page desc | 1.52 | 1.99 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 20 rare customer_id: capped count | 1.10 | 1.73 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| region =, sort created_at (range on created_at) | 2 common region: first page desc | 1.31 | 1.48 | Limit → Index Scan (orders_qs_created_at) | yes |
| region =, sort created_at (range on created_at) | 2 common region: capped count | 2.76 | 2.96 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 5 common region: first page desc | 1.06 | 1.14 | Limit → Index Scan (orders_qs_created_at) | yes |
| region =, sort created_at (range on created_at) | 5 common region: capped count | 4.37 | 4.62 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 20 common region: first page desc | 0.89 | 0.97 | Limit → Index Scan (orders_qs_created_at) | yes |
| region =, sort created_at (range on created_at) | 20 common region: capped count | 4.37 | 6.27 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 2 rare region: first page desc | 16.12 | 18.62 | Limit → Index Scan (orders_qs_created_at) | yes |
| region =, sort created_at (range on created_at) | 2 rare region: capped count | 3.19 | 4.45 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 5 rare region: first page desc | 7.04 | 8.74 | Limit → Index Scan (orders_qs_created_at) | yes |
| region =, sort created_at (range on created_at) | 5 rare region: capped count | 4.23 | 6.37 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 20 rare region: first page desc | 1.81 | 1.92 | Limit → Index Scan (orders_qs_created_at) | yes |
| region =, sort created_at (range on created_at) | 20 rare region: capped count | 3.70 | 4.25 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| channel =, sort created_at | 2 common channel: first page desc | 0.88 | 0.96 | Limit → Index Scan (orders_qs_created_at) | yes |
| channel =, sort created_at | 2 common channel: capped count | 4.20 | 4.40 | Aggregate → Limit → Index Only Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | 5 common channel: first page desc | 0.86 | 0.91 | Limit → Index Scan (orders_qs_created_at) | yes |
| channel =, sort created_at | 5 common channel: capped count | 4.19 | 4.76 | Aggregate → Limit → Index Only Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | 2 rare channel: first page desc | 4.74 | 5.19 | Limit → Index Scan (orders_qs_created_at) | yes |
| channel =, sort created_at | 2 rare channel: capped count | 4.12 | 4.50 | Aggregate → Limit → Index Only Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | 5 rare channel: first page desc | 0.85 | 0.95 | Limit → Index Scan (orders_qs_created_at) | yes |
| channel =, sort created_at | 5 rare channel: capped count | 4.13 | 4.42 | Aggregate → Limit → Index Only Scan (orders_qs_channel__created_at) | yes |
| status_code =, region =, sort created_at | 2 common status_code, 2 common region: first page desc | 1.52 | 1.73 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, region =, sort created_at | 2 common status_code, 2 common region: capped count | 2.85 | 3.13 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 5 common status_code, 5 common region: first page desc | 1.11 | 1.16 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, region =, sort created_at | 5 common status_code, 5 common region: capped count | 4.32 | 4.71 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 7 common status_code, 20 common region: first page desc | 0.92 | 1.05 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, region =, sort created_at | 7 common status_code, 20 common region: capped count | 4.68 | 7.58 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 2 rare status_code, 2 rare region: first page desc | 0.92 | 1.01 | Limit → Sort → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 2 rare status_code, 2 rare region: capped count | 0.51 | 0.67 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 5 rare status_code, 5 rare region: first page desc | 24.85 | 27.57 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, region =, sort created_at | 5 rare status_code, 5 rare region: capped count | 3.08 | 3.52 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 7 rare status_code, 20 rare region: first page desc | 1.85 | 1.94 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, region =, sort created_at | 7 rare status_code, 20 rare region: capped count | 4.91 | 7.88 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, channel =, sort created_at | 2 common status_code, 2 common channel: first page desc | 0.98 | 1.08 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, channel =, sort created_at | 2 common status_code, 2 common channel: capped count | 4.71 | 7.77 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 5 common status_code, 5 common channel: first page desc | 0.87 | 1.03 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, channel =, sort created_at | 5 common status_code, 5 common channel: capped count | 3.21 | 3.41 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 7 common status_code, 5 common channel: first page desc | 0.87 | 0.92 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, channel =, sort created_at | 7 common status_code, 5 common channel: capped count | 3.18 | 3.58 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 2 rare status_code, 2 rare channel: first page desc | 3.41 | 3.74 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 2 rare status_code, 2 rare channel: capped count | 0.91 | 1.05 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 5 rare status_code, 5 rare channel: first page desc | 1.62 | 1.75 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, channel =, sort created_at | 5 rare status_code, 5 rare channel: capped count | 3.22 | 4.39 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 7 rare status_code, 5 rare channel: first page desc | 0.90 | 0.99 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, channel =, sort created_at | 7 rare status_code, 5 rare channel: capped count | 3.17 | 3.49 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |

No shape is declared `multi: false`.
