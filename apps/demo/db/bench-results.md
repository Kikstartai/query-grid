Measured 2026-11-13 over 620,000 orders, 30 runs per query after 3 warm-ups; time is planning plus execution from `EXPLAIN (ANALYZE)`, in ms.

| Shape | Query | p50 | p95 | Plan | Pass |
| --- | --- | ---: | ---: | --- | --- |
| no filter, sort created_at (range on created_at) | first page desc | 0.66 | 0.74 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | deep keyset page desc | 0.76 | 0.86 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | first page asc | 0.63 | 0.68 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | deep keyset page asc | 0.76 | 0.81 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | capped count | 2.31 | 2.55 | Aggregate → Limit → Index Only Scan (orders_pkey) | yes |
| no filter, sort created_at (range on created_at) | capped total | 8.02 | 8.86 | Aggregate → Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | range, first page desc | 0.77 | 0.80 | Limit → Index Scan (orders_qs_created_at) | yes |
| no filter, sort created_at (range on created_at) | range, capped count | 2.72 | 2.88 | Aggregate → Limit → Index Only Scan (orders_qs_created_at) | yes |
| no filter, sort total (range on total) | first page desc | 0.66 | 0.71 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | deep keyset page desc | 0.77 | 0.86 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | first page asc | 0.64 | 0.67 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | deep keyset page asc | 0.77 | 0.86 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | capped count | 2.33 | 2.48 | Aggregate → Limit → Index Only Scan (orders_pkey) | yes |
| no filter, sort total (range on total) | capped total | 2.37 | 2.50 | Aggregate → Limit → Index Only Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | range, first page desc | 0.75 | 0.79 | Limit → Index Scan (orders_qs_total) | yes |
| no filter, sort total (range on total) | range, capped count | 2.38 | 2.50 | Aggregate → Limit → Index Only Scan (orders_qs_total) | yes |
| status_code =, sort created_at (range on created_at) | first page desc | 0.72 | 0.75 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | deep keyset page desc | 0.81 | 0.87 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | first page asc | 0.72 | 0.76 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | deep keyset page asc | 0.80 | 0.83 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | capped count | 2.40 | 2.57 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | capped total | 8.58 | 10.50 | Aggregate → Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | range, first page desc | 0.80 | 0.85 | Limit → Index Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort created_at (range on created_at) | range, capped count | 2.44 | 2.87 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | first page desc | 0.74 | 0.79 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | deep keyset page desc | 0.82 | 0.88 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | first page asc | 0.75 | 0.80 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | deep keyset page asc | 0.79 | 0.83 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | capped count | 2.40 | 2.66 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__created_at) | yes |
| status_code =, sort total (range on total) | capped total | 2.54 | 2.74 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | range, first page desc | 0.81 | 0.90 | Limit → Index Scan (orders_qs_status_code__total) | yes |
| status_code =, sort total (range on total) | range, capped count | 2.45 | 2.57 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__total) | yes |
| customer_id =, sort created_at | first page desc | 0.76 | 0.79 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | deep keyset page desc | 0.78 | 0.84 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | first page asc | 0.73 | 0.78 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | deep keyset page asc | 0.76 | 0.80 | Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | capped count | 2.39 | 2.56 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id__created_at) | yes |
| customer_id =, sort created_at | capped total | 10.03 | 11.10 | Aggregate → Limit → Index Scan (orders_qs_customer_id__created_at) | yes |
| region =, sort created_at (range on created_at) | first page desc | 0.72 | 0.75 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | deep keyset page desc | 0.75 | 0.79 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | first page asc | 0.71 | 0.76 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | deep keyset page asc | 0.76 | 0.80 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | capped count | 2.38 | 2.51 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | capped total | 9.62 | 11.20 | Aggregate → Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | range, first page desc | 0.78 | 0.82 | Limit → Index Scan (orders_qs_region__created_at) | yes |
| region =, sort created_at (range on created_at) | range, capped count | 2.42 | 2.61 | Aggregate → Limit → Index Only Scan (orders_qs_region__created_at) | yes |
| channel =, sort created_at | first page desc | 0.73 | 0.78 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | deep keyset page desc | 0.79 | 0.86 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | first page asc | 0.70 | 0.73 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | deep keyset page asc | 0.79 | 0.90 | Limit → Index Scan (orders_qs_channel__created_at) | yes |
| channel =, sort created_at | capped count | 4.49 | 7.04 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| channel =, sort created_at | capped total | 9.04 | 10.39 | Aggregate → Limit → Index Scan (orders_qs_channel__created_at) | yes |
| status_code =, region =, sort created_at | first page desc | 0.77 | 0.81 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | deep keyset page desc | 0.81 | 0.86 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | first page asc | 0.75 | 0.81 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | deep keyset page asc | 0.81 | 0.92 | Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | capped count | 2.48 | 2.64 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, region =, sort created_at | capped total | 10.30 | 13.50 | Aggregate → Limit → Index Scan (orders_qs_status_code__region__created_at) | yes |
| status_code =, channel =, sort created_at | first page desc | 0.77 | 0.81 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | deep keyset page desc | 0.83 | 0.87 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | first page asc | 0.72 | 0.76 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | deep keyset page asc | 0.81 | 0.85 | Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | capped count | 2.49 | 2.78 | Aggregate → Limit → Index Only Scan (orders_qs_status_code__channel__created_at) | yes |
| status_code =, channel =, sort created_at | capped total | 9.43 | 12.74 | Aggregate → Limit → Index Scan (orders_qs_status_code__channel__created_at) | yes |
| quick filter over customer_name, order_number | “Smith”, capped page | 1.77 | 2.84 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “Mokoena”, capped page | 6.05 | 6.57 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “Zanele Dlam”, capped page | 5.29 | 5.53 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “mok”, capped page | 7.95 | 8.90 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “a M”, capped page | 11.96 | 13.01 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “12345”, capped page | 0.39 | 0.40 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
| quick filter over customer_name, order_number | “ena 4”, capped page | 7.75 | 8.21 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick) | yes |
