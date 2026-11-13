Measured 2026-11-13 over 620,000 orders, 30 runs per query after 3 warm-ups; time is planning plus execution from `EXPLAIN (ANALYZE)`, in ms.

| Shape | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| no filter, sort created_at (range on created_at) | first page desc | 0.65 | 0.68 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | deep keyset page desc | 1.82 | 3.18 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | first page asc | 0.76 | 0.82 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | deep keyset page asc | 1.90 | 2.23 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | capped count | 3.45 | 3.97 | Aggregate → Limit → Index Only Scan (orders_pkey) | yes |
| no filter, sort created_at (range on created_at) | capped total | 8.58 | 11.65 | Aggregate → Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | range, first page desc | 1.59 | 2.18 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | range, capped count | 2.74 | 2.83 | Aggregate → Limit → Index Only Scan (orders_qs_created_at) | yes |
| no filter, sort total (range on total) | first page desc | 1.03 | 1.13 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | deep keyset page desc | 1.37 | 1.65 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | first page asc | 0.85 | 0.92 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | deep keyset page asc | 1.45 | 1.62 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | capped count | 3.47 | 3.76 | Aggregate → Limit → Index Only Scan (orders_pkey) | yes |
| no filter, sort total (range on total) | capped total | 2.36 | 2.53 | Aggregate → Limit → Index Only Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | range, first page desc | 1.04 | 1.40 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | range, capped count | 2.35 | 2.51 | Aggregate → Limit → Index Only Scan (orders_qs_total) | yes |
| status_code =, sort created_at (range on created_at) | first page desc | 0.69 | 0.78 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | deep keyset page desc | 1.20 | 2.03 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | first page asc | 0.72 | 0.81 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | deep keyset page asc | 1.01 | 1.09 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | capped count | 2.39 | 2.56 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | capped total | 9.01 | 9.90 | Aggregate → Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | range, first page desc | 1.05 | 1.78 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | range, capped count | 2.43 | 2.97 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | first page desc | 0.90 | 1.20 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | deep keyset page desc | 0.98 | 1.08 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | first page asc | 0.80 | 0.87 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | deep keyset page asc | 0.94 | 1.04 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | capped count | 2.39 | 2.52 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | capped total | 2.56 | 2.99 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | range, first page desc | 0.96 | 1.17 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | range, capped count | 2.46 | 2.73 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__total) | yes |
| customer_id =, sort created_at | first page desc | 0.89 | 0.97 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | deep keyset page desc | 0.80 | 0.96 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | first page asc | 0.77 | 0.83 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | deep keyset page asc | 0.80 | 0.83 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | capped count | 2.39 | 2.58 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | capped total | 10.64 | 12.45 | Aggregate → Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| region =, sort created_at (range on created_at) | first page desc | 0.76 | 0.90 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | deep keyset page desc | 0.78 | 0.82 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | first page asc | 0.76 | 0.85 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | deep keyset page asc | 0.78 | 0.85 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | capped count | 2.39 | 2.82 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | capped total | 10.57 | 14.02 | Aggregate → Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | range, first page desc | 0.80 | 0.87 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | range, capped count | 2.42 | 2.69 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| channel =, sort created_at | first page desc | 0.69 | 0.79 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | deep keyset page desc | 0.82 | 0.87 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | first page asc | 0.70 | 0.80 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | deep keyset page asc | 0.82 | 0.88 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | capped count | 4.58 | 4.92 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| channel =, sort created_at | capped total | 9.15 | 13.88 | Aggregate → Limit → Index Scan (orders_qs_channel__created_at) | yes |
| status_code =, region =, sort created_at | first page desc | 0.80 | 1.05 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | deep keyset page desc | 0.83 | 0.92 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | first page asc | 0.77 | 0.79 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | deep keyset page asc | 0.84 | 0.91 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | capped count | 2.53 | 2.69 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | capped total | 10.52 | 11.70 | Aggregate → Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, channel =, sort created_at | first page desc | 0.72 | 0.83 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | deep keyset page desc | 0.84 | 0.88 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | first page asc | 0.73 | 0.80 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | deep keyset page asc | 0.83 | 0.90 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | capped count | 2.49 | 2.65 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | capped total | 9.67 | 11.85 | Aggregate → Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| quick filter over customer_name, order_number | “Smith”, capped page | 1.80 | 2.04 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “Mokoena”, capped page | 6.15 | 8.59 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “Zanele Dlam”, capped page | 5.39 | 6.26 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “mok”, capped page | 7.92 | 9.11 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “a M”, capped page | 11.93 | 13.42 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “12345”, capped page | 0.38 | 0.42 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “ena 4”, capped page | 7.70 | 8.64 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “---”, capped page | – | – | refused by the server in 33 of 33 runs: over the 120 ms quick filter budget | yes |
