Measured 2026-11-14 over 620,000 orders, 30 runs per query after 3 warm-ups; time is planning plus execution from `EXPLAIN (ANALYZE)`, in ms.

## One value per field: 72 of 72 pass

| Shape | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| no filter, sort created_at (range on created_at) | first page desc | 0.82 | 0.95 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | deep keyset page desc | 0.90 | 1.02 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | first page asc | 0.80 | 0.91 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | deep keyset page asc | 0.93 | 1.03 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | capped count | 2.63 | 2.78 | Aggregate → Limit → Index Only Scan (orders_pkey) | yes |
| no filter, sort created_at (range on created_at) | capped total | 10.52 | 12.03 | Aggregate → Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | range, first page desc | 0.93 | 1.06 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | range, capped count | 2.68 | 2.81 | Aggregate → Limit → Index Only Scan (orders_qs_created_at) | yes |
| no filter, sort total (range on total) | first page desc | 0.85 | 1.00 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | deep keyset page desc | 0.91 | 1.02 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | first page asc | 0.85 | 0.93 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | deep keyset page asc | 0.93 | 1.56 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | capped count | 2.61 | 2.72 | Aggregate → Limit → Index Only Scan (orders_pkey) | yes |
| no filter, sort total (range on total) | capped total | 2.61 | 2.75 | Aggregate → Limit → Index Only Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | range, first page desc | 0.90 | 0.97 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | range, capped count | 2.66 | 2.83 | Aggregate → Limit → Index Only Scan (orders_qs_total) | yes |
| status_code =, sort created_at (range on created_at) | first page desc | 0.92 | 1.01 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | deep keyset page desc | 0.99 | 1.32 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | first page asc | 0.91 | 1.02 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | deep keyset page asc | 0.95 | 1.08 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | capped count | 4.51 | 4.84 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | capped total | 11.35 | 13.51 | Aggregate → Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | range, first page desc | 1.00 | 1.07 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | range, capped count | 4.49 | 5.33 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | first page desc | 0.94 | 1.27 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | deep keyset page desc | 1.02 | 1.10 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | first page asc | 0.93 | 1.08 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | deep keyset page asc | 0.96 | 1.22 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | capped count | 4.38 | 5.01 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | capped total | 4.51 | 5.07 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | range, first page desc | 0.98 | 1.09 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | range, capped count | 4.43 | 5.29 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__total) | yes |
| customer_id =, sort created_at | first page desc | 0.91 | 0.95 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | deep keyset page desc | 0.96 | 1.23 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | first page asc | 0.90 | 0.97 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | deep keyset page asc | 0.93 | 1.04 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | capped count | 2.76 | 2.92 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | capped total | 12.04 | 13.49 | Aggregate → Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| region =, sort created_at (range on created_at) | first page desc | 0.90 | 0.99 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | deep keyset page desc | 0.92 | 1.14 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | first page asc | 0.90 | 0.97 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | deep keyset page asc | 0.94 | 1.05 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | capped count | 2.73 | 2.82 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | capped total | 11.69 | 14.05 | Aggregate → Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | range, first page desc | 0.98 | 1.07 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | range, capped count | 2.79 | 4.64 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| channel =, sort created_at | first page desc | 0.88 | 0.96 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | deep keyset page desc | 0.95 | 1.03 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | first page asc | 0.82 | 0.90 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | deep keyset page asc | 0.95 | 1.03 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | capped count | 4.92 | 5.38 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| channel =, sort created_at | capped total | 9.58 | 10.77 | Aggregate → Limit → Index Scan (orders_qs_channel__created_at) | yes |
| status_code =, region =, sort created_at | first page desc | 0.94 | 1.03 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | deep keyset page desc | 1.01 | 1.23 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | first page asc | 0.94 | 1.06 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | deep keyset page asc | 0.99 | 1.17 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | capped count | 2.82 | 2.89 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | capped total | 12.52 | 16.71 | Aggregate → Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, channel =, sort created_at | first page desc | 0.98 | 1.74 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | deep keyset page desc | 1.03 | 1.14 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | first page asc | 0.89 | 1.01 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | deep keyset page asc | 1.03 | 1.29 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | capped count | 2.83 | 3.02 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | capped total | 11.02 | 12.92 | Aggregate → Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| quick filter over customer_name, order_number | “Smith”, capped page | 2.20 | 2.58 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “Mokoena”, capped page | 7.47 | 8.17 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “Zanele Dlam”, capped page | 6.50 | 7.85 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “mok”, capped page | 9.88 | 10.37 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “a M”, capped page | 15.36 | 17.02 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “12345”, capped page | 0.46 | 0.51 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “ena 4”, capped page | 9.45 | 10.21 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “---”, capped page | – | – | refused by the server in 33 of 33 runs: over the 120 ms quick filter budget | yes |

## Several values per field: 80 of 80 pass

Each ordered shape with an equality field, with 2, 5 and the field's cap of values, taken from the most common and then from the rarest. The bar is the same p95 budget and no Seq Scan; a Sort is allowed here and shows in the plan, because `= ANY` over several values has no single index order to read.

| Shape | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| status_code =, sort created_at (range on created_at) | 2 common status_code: first page desc | 0.92 | 1.01 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 2 common status_code: capped count | 4.38 | 7.73 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 5 common status_code: first page desc | 0.91 | 0.99 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 5 common status_code: capped count | 4.35 | 4.69 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 common status_code: first page desc | 0.89 | 1.05 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 common status_code: capped count | 4.30 | 4.76 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | 2 rare status_code: first page desc | 6.88 | 8.12 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 2 rare status_code: capped count | 3.43 | 3.82 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__total) | yes |
| status_code =, sort created_at (range on created_at) | 5 rare status_code: first page desc | 1.59 | 1.78 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 5 rare status_code: capped count | 4.42 | 4.79 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__total) | yes |
| status_code =, sort created_at (range on created_at) | 7 rare status_code: first page desc | 0.90 | 0.96 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, sort created_at (range on created_at) | 7 rare status_code: capped count | 4.26 | 5.27 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 2 common status_code: first page desc | 1.02 | 1.26 | Limit → Index Scan (orders_qs_total) | yes |
| status_code =, sort total (range on total) | 2 common status_code: capped count | 4.32 | 5.69 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 5 common status_code: first page desc | 0.91 | 0.99 | Limit → Index Scan (orders_qs_total) | yes |
| status_code =, sort total (range on total) | 5 common status_code: capped count | 4.34 | 4.76 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 7 common status_code: first page desc | 0.90 | 0.96 | Limit → Index Scan (orders_qs_total) | yes |
| status_code =, sort total (range on total) | 7 common status_code: capped count | 4.37 | 7.18 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | 2 rare status_code: first page desc | 7.52 | 8.82 | Limit → Index Scan (orders_qs_total) | yes |
| status_code =, sort total (range on total) | 2 rare status_code: capped count | 3.46 | 5.40 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | 5 rare status_code: first page desc | 1.67 | 1.80 | Limit → Index Scan (orders_qs_total) | yes |
| status_code =, sort total (range on total) | 5 rare status_code: capped count | 4.37 | 4.85 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | 7 rare status_code: first page desc | 0.93 | 1.02 | Limit → Index Scan (orders_qs_total) | yes |
| status_code =, sort total (range on total) | 7 rare status_code: capped count | 4.30 | 5.73 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| customer_id =, sort created_at | 2 common customer_id: first page desc | 5.59 | 6.19 | Limit → Index Scan (orders_qs_created_at) | yes |
| customer_id =, sort created_at | 2 common customer_id: capped count | 2.76 | 2.91 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 5 common customer_id: first page desc | 4.18 | 4.92 | Limit → Index Scan (orders_qs_created_at) | yes |
| customer_id =, sort created_at | 5 common customer_id: capped count | 2.74 | 2.94 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 20 common customer_id: first page desc | 2.88 | 3.25 | Limit → Index Scan (orders_qs_created_at) | yes |
| customer_id =, sort created_at | 20 common customer_id: capped count | 2.75 | 2.96 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 2 rare customer_id: first page desc | 0.35 | 0.42 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 2 rare customer_id: capped count | 0.37 | 0.50 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 5 rare customer_id: first page desc | 0.57 | 0.67 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 5 rare customer_id: capped count | 0.51 | 0.58 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 20 rare customer_id: first page desc | 1.44 | 1.62 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | 20 rare customer_id: capped count | 1.02 | 1.14 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| region =, sort created_at (range on created_at) | 2 common region: first page desc | 1.32 | 1.52 | Limit → Index Scan (orders_qs_created_at) | yes |
| region =, sort created_at (range on created_at) | 2 common region: capped count | 2.74 | 3.05 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 5 common region: first page desc | 1.09 | 1.17 | Limit → Index Scan (orders_qs_created_at) | yes |
| region =, sort created_at (range on created_at) | 5 common region: capped count | 4.34 | 5.30 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 20 common region: first page desc | 0.93 | 0.99 | Limit → Index Scan (orders_qs_created_at) | yes |
| region =, sort created_at (range on created_at) | 20 common region: capped count | 4.36 | 4.82 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 2 rare region: first page desc | 16.59 | 18.10 | Limit → Index Scan (orders_qs_created_at) | yes |
| region =, sort created_at (range on created_at) | 2 rare region: capped count | 3.16 | 3.43 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 5 rare region: first page desc | 6.55 | 7.45 | Limit → Index Scan (orders_qs_created_at) | yes |
| region =, sort created_at (range on created_at) | 5 rare region: capped count | 4.03 | 4.31 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | 20 rare region: first page desc | 1.83 | 2.29 | Limit → Index Scan (orders_qs_created_at) | yes |
| region =, sort created_at (range on created_at) | 20 rare region: capped count | 3.69 | 3.97 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| channel =, sort created_at | 2 common channel: first page desc | 0.91 | 1.04 | Limit → Index Scan (orders_qs_created_at) | yes |
| channel =, sort created_at | 2 common channel: capped count | 4.20 | 4.92 | Aggregate → Limit → Index Only Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | 5 common channel: first page desc | 0.88 | 0.93 | Limit → Index Scan (orders_qs_created_at) | yes |
| channel =, sort created_at | 5 common channel: capped count | 4.10 | 5.23 | Aggregate → Limit → Index Only Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | 2 rare channel: first page desc | 4.81 | 5.58 | Limit → Index Scan (orders_qs_created_at) | yes |
| channel =, sort created_at | 2 rare channel: capped count | 4.21 | 4.59 | Aggregate → Limit → Index Only Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | 5 rare channel: first page desc | 0.91 | 1.10 | Limit → Index Scan (orders_qs_created_at) | yes |
| channel =, sort created_at | 5 rare channel: capped count | 4.12 | 4.44 | Aggregate → Limit → Index Only Scan (orders_qs_channel__created_at) | yes |
| status_code =, region =, sort created_at | 2 common status_code, 2 common region: first page desc | 1.61 | 1.74 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, region =, sort created_at | 2 common status_code, 2 common region: capped count | 2.88 | 5.00 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 5 common status_code, 5 common region: first page desc | 1.15 | 1.24 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, region =, sort created_at | 5 common status_code, 5 common region: capped count | 4.34 | 4.73 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 7 common status_code, 20 common region: first page desc | 0.99 | 3.57 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, region =, sort created_at | 7 common status_code, 20 common region: capped count | 4.90 | 5.51 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 2 rare status_code, 2 rare region: first page desc | 0.97 | 1.12 | Limit → Sort → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 2 rare status_code, 2 rare region: capped count | 0.55 | 0.67 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 5 rare status_code, 5 rare region: first page desc | 27.61 | 32.42 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, region =, sort created_at | 5 rare status_code, 5 rare region: capped count | 3.51 | 10.07 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | 7 rare status_code, 20 rare region: first page desc | 2.08 | 2.99 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, region =, sort created_at | 7 rare status_code, 20 rare region: capped count | 5.45 | 40.80 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, channel =, sort created_at | 2 common status_code, 2 common channel: first page desc | 1.02 | 1.14 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, channel =, sort created_at | 2 common status_code, 2 common channel: capped count | 4.66 | 4.96 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 5 common status_code, 5 common channel: first page desc | 0.94 | 1.15 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, channel =, sort created_at | 5 common status_code, 5 common channel: capped count | 3.22 | 3.52 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 7 common status_code, 5 common channel: first page desc | 0.93 | 1.05 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, channel =, sort created_at | 7 common status_code, 5 common channel: capped count | 3.19 | 4.13 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 2 rare status_code, 2 rare channel: first page desc | 3.54 | 3.87 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 2 rare status_code, 2 rare channel: capped count | 0.93 | 1.08 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 5 rare status_code, 5 rare channel: first page desc | 1.69 | 1.89 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, channel =, sort created_at | 5 rare status_code, 5 rare channel: capped count | 3.23 | 3.53 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | 7 rare status_code, 5 rare channel: first page desc | 0.95 | 1.05 | Limit → Index Scan (orders_qs_created_at) | yes |
| status_code =, channel =, sort created_at | 7 rare status_code, 5 rare channel: capped count | 3.24 | 3.59 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |

No shape is declared `multi: false`.
