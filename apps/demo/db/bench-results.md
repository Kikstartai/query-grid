Measured 2026-11-14 over 620,000 orders, 30 runs per query after 3 warm-ups; time is planning plus execution from `EXPLAIN (ANALYZE)`, in ms.

| Shape | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| no filter, sort created_at (range on created_at) | first page desc | 0.82 | 0.98 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | deep keyset page desc | 1.85 | 2.15 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | first page asc | 0.85 | 0.95 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | deep keyset page asc | 2.04 | 2.33 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | capped count | 4.36 | 8.60 | Aggregate → Limit → Index Only Scan (orders_pkey) | yes |
| no filter, sort created_at (range on created_at) | capped total | 12.06 | 19.69 | Aggregate → Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | range, first page desc | 1.44 | 1.73 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | range, capped count | 3.20 | 3.45 | Aggregate → Limit → Index Only Scan (orders_qs_created_at) | yes |
| no filter, sort total (range on total) | first page desc | 1.14 | 1.30 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | deep keyset page desc | 1.36 | 1.68 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | first page asc | 0.86 | 1.07 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | deep keyset page asc | 1.23 | 1.94 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | capped count | 4.39 | 6.38 | Aggregate → Limit → Index Only Scan (orders_pkey) | yes |
| no filter, sort total (range on total) | capped total | 2.61 | 2.71 | Aggregate → Limit → Index Only Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | range, first page desc | 1.09 | 1.43 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | range, capped count | 2.70 | 4.36 | Aggregate → Limit → Index Only Scan (orders_qs_total) | yes |
| status_code =, sort created_at (range on created_at) | first page desc | 0.88 | 0.99 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | deep keyset page desc | 1.15 | 1.41 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | first page asc | 0.94 | 1.24 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | deep keyset page asc | 1.05 | 1.19 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | capped count | 2.80 | 4.31 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | capped total | 12.29 | 16.65 | Aggregate → Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | range, first page desc | 1.14 | 1.35 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | range, capped count | 2.79 | 4.26 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | first page desc | 1.09 | 2.18 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | deep keyset page desc | 1.00 | 1.17 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | first page asc | 0.96 | 1.10 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | deep keyset page asc | 0.99 | 1.11 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | capped count | 2.78 | 2.99 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | capped total | 2.95 | 3.22 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | range, first page desc | 1.04 | 1.33 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | range, capped count | 2.82 | 2.98 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__total) | yes |
| customer_id =, sort created_at | first page desc | 0.93 | 1.02 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | deep keyset page desc | 0.95 | 1.05 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | first page asc | 0.92 | 1.08 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | deep keyset page asc | 0.95 | 1.01 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | capped count | 2.74 | 3.00 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | capped total | 12.75 | 14.57 | Aggregate → Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| region =, sort created_at (range on created_at) | first page desc | 0.93 | 1.13 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | deep keyset page desc | 0.93 | 1.04 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | first page asc | 0.91 | 1.05 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | deep keyset page asc | 0.95 | 1.07 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | capped count | 2.77 | 3.91 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | capped total | 12.59 | 16.59 | Aggregate → Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | range, first page desc | 0.95 | 1.06 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | range, capped count | 2.80 | 3.04 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| channel =, sort created_at | first page desc | 0.86 | 1.01 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | deep keyset page desc | 0.97 | 1.10 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | first page asc | 0.89 | 1.12 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | deep keyset page asc | 0.95 | 1.10 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | capped count | 6.17 | 6.90 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| channel =, sort created_at | capped total | 12.17 | 19.35 | Aggregate → Limit → Index Scan (orders_qs_channel__created_at) | yes |
| status_code =, region =, sort created_at | first page desc | 0.96 | 1.08 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | deep keyset page desc | 1.01 | 1.11 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | first page asc | 0.96 | 1.14 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | deep keyset page asc | 1.01 | 1.14 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | capped count | 2.88 | 3.04 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | capped total | 12.26 | 13.28 | Aggregate → Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, channel =, sort created_at | first page desc | 0.88 | 1.01 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | deep keyset page desc | 1.01 | 1.13 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | first page asc | 0.93 | 1.02 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | deep keyset page asc | 0.97 | 1.11 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | capped count | 2.85 | 3.02 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | capped total | 13.00 | 26.08 | Aggregate → Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| quick filter over customer_name, order_number | “Smith”, capped page | 2.25 | 3.04 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “Mokoena”, capped page | 7.48 | 7.91 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “Zanele Dlam”, capped page | 6.62 | 7.97 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “mok”, capped page | 10.22 | 10.79 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “a M”, capped page | 15.29 | 19.23 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “12345”, capped page | 0.47 | 0.59 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “ena 4”, capped page | 9.62 | 10.77 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “---”, capped page | – | – | refused by the server in 33 of 33 runs: over the 120 ms quick filter budget | yes |
