Measured 2026-11-15 over 620,000 orders, 30 runs per query after 3 warm-ups; time is planning plus execution from `EXPLAIN (ANALYZE)`, in ms.

## One value per field: 72 of 72 pass

| Index                                                | Query                      |   p50 |   p95 | Plan                                                                             | Pass |
| ---------------------------------------------------- | -------------------------- | ----: | ----: | -------------------------------------------------------------------------------- | ---- |
| no filter, sort created_at (range on created_at)     | first page desc            |  0.79 |  0.90 | Limit → Index Scan (orders_qs_created_at)                                        | yes  |
| no filter, sort created_at (range on created_at)     | deep keyset page desc      |  0.93 |  1.08 | Limit → Index Scan (orders_qs_created_at)                                        | yes  |
| no filter, sort created_at (range on created_at)     | first page asc             |  0.79 |  0.87 | Limit → Index Scan (orders_qs_created_at)                                        | yes  |
| no filter, sort created_at (range on created_at)     | deep keyset page asc       |  0.93 |  1.00 | Limit → Index Scan (orders_qs_created_at)                                        | yes  |
| no filter, sort created_at (range on created_at)     | capped count               |  2.59 |  2.74 | Aggregate → Limit → Index Only Scan (orders_pkey)                                | yes  |
| no filter, sort created_at (range on created_at)     | capped total               | 11.79 | 13.88 | Aggregate → Limit → Index Scan (orders_qs_created_at)                            | yes  |
| no filter, sort created_at (range on created_at)     | range, first page desc     |  0.94 |  1.03 | Limit → Index Scan (orders_qs_created_at)                                        | yes  |
| no filter, sort created_at (range on created_at)     | range, capped count        |  3.16 |  3.28 | Aggregate → Limit → Index Only Scan (orders_qs_created_at)                       | yes  |
| no filter, sort total (range on total)               | first page desc            |  0.81 |  0.87 | Limit → Index Scan (orders_qs_total)                                             | yes  |
| no filter, sort total (range on total)               | deep keyset page desc      |  0.97 |  1.05 | Limit → Index Scan (orders_qs_total)                                             | yes  |
| no filter, sort total (range on total)               | first page asc             |  0.80 |  0.95 | Limit → Index Scan (orders_qs_total)                                             | yes  |
| no filter, sort total (range on total)               | deep keyset page asc       |  0.95 |  1.21 | Limit → Index Scan (orders_qs_total)                                             | yes  |
| no filter, sort total (range on total)               | capped count               |  2.61 |  3.27 | Aggregate → Limit → Index Only Scan (orders_pkey)                                | yes  |
| no filter, sort total (range on total)               | capped total               | 12.01 | 14.29 | Aggregate → Limit → Index Scan (orders_qs_total)                                 | yes  |
| no filter, sort total (range on total)               | range, first page desc     |  0.91 |  1.03 | Limit → Index Scan (orders_qs_total)                                             | yes  |
| no filter, sort total (range on total)               | range, capped count        |  2.67 |  2.87 | Aggregate → Limit → Index Only Scan (orders_qs_total)                            | yes  |
| status_code =, sort created_at (range on created_at) | first page desc            |  0.90 |  1.07 | Limit → Index Scan (orders_qs_status_code\_\_created_at)                         | yes  |
| status_code =, sort created_at (range on created_at) | deep keyset page desc      |  0.98 |  1.05 | Limit → Index Scan (orders_qs_status_code\_\_created_at)                         | yes  |
| status_code =, sort created_at (range on created_at) | first page asc             |  0.90 |  1.29 | Limit → Index Scan (orders_qs_status_code\_\_created_at)                         | yes  |
| status_code =, sort created_at (range on created_at) | deep keyset page asc       |  0.97 |  1.02 | Limit → Index Scan (orders_qs_status_code\_\_created_at)                         | yes  |
| status_code =, sort created_at (range on created_at) | capped count               |  4.44 |  5.00 | Aggregate → Limit → Index Only Scan (orders_qs_status_code\_\_created_at)        | yes  |
| status_code =, sort created_at (range on created_at) | capped total               | 11.87 | 13.85 | Aggregate → Limit → Index Scan (orders_qs_status_code\_\_created_at)             | yes  |
| status_code =, sort created_at (range on created_at) | range, first page desc     |  0.98 |  1.11 | Limit → Index Scan (orders_qs_status_code\_\_created_at)                         | yes  |
| status_code =, sort created_at (range on created_at) | range, capped count        |  4.42 |  5.96 | Aggregate → Limit → Index Only Scan (orders_qs_status_code\_\_created_at)        | yes  |
| status_code =, sort total (range on total)           | first page desc            |  0.89 |  1.01 | Limit → Index Scan (orders_qs_status_code\_\_total)                              | yes  |
| status_code =, sort total (range on total)           | deep keyset page desc      |  0.99 |  1.08 | Limit → Index Scan (orders_qs_status_code\_\_total)                              | yes  |
| status_code =, sort total (range on total)           | first page asc             |  0.91 |  1.00 | Limit → Index Scan (orders_qs_status_code\_\_total)                              | yes  |
| status_code =, sort total (range on total)           | deep keyset page asc       |  0.96 |  1.04 | Limit → Index Scan (orders_qs_status_code\_\_total)                              | yes  |
| status_code =, sort total (range on total)           | capped count               |  4.30 |  4.75 | Aggregate → Limit → Index Only Scan (orders_qs_status_code\_\_created_at)        | yes  |
| status_code =, sort total (range on total)           | capped total               | 12.46 | 15.26 | Aggregate → Limit → Index Scan (orders_qs_status_code\_\_total)                  | yes  |
| status_code =, sort total (range on total)           | range, first page desc     |  1.01 |  1.20 | Limit → Index Scan (orders_qs_status_code\_\_total)                              | yes  |
| status_code =, sort total (range on total)           | range, capped count        |  4.56 |  8.61 | Aggregate → Limit → Index Only Scan (orders_qs_status_code\_\_total)             | yes  |
| customer_id =, sort created_at                       | first page desc            |  0.91 |  0.98 | Limit → Index Scan (orders_qs_customer_id\_\_created_at)                         | yes  |
| customer_id =, sort created_at                       | deep keyset page desc      |  0.95 |  1.03 | Limit → Index Scan (orders_qs_customer_id\_\_created_at)                         | yes  |
| customer_id =, sort created_at                       | first page asc             |  0.90 |  0.98 | Limit → Index Scan (orders_qs_customer_id\_\_created_at)                         | yes  |
| customer_id =, sort created_at                       | deep keyset page asc       |  0.92 |  1.04 | Limit → Index Scan (orders_qs_customer_id\_\_created_at)                         | yes  |
| customer_id =, sort created_at                       | capped count               |  2.74 |  2.91 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id\_\_created_at)        | yes  |
| customer_id =, sort created_at                       | capped total               | 12.41 | 17.86 | Aggregate → Limit → Index Scan (orders_qs_customer_id\_\_created_at)             | yes  |
| region =, sort created_at (range on created_at)      | first page desc            |  0.88 |  0.95 | Limit → Index Scan (orders_qs_region\_\_created_at)                              | yes  |
| region =, sort created_at (range on created_at)      | deep keyset page desc      |  0.92 |  1.06 | Limit → Index Scan (orders_qs_region\_\_created_at)                              | yes  |
| region =, sort created_at (range on created_at)      | first page asc             |  0.87 |  1.07 | Limit → Index Scan (orders_qs_region\_\_created_at)                              | yes  |
| region =, sort created_at (range on created_at)      | deep keyset page asc       |  0.93 |  1.09 | Limit → Index Scan (orders_qs_region\_\_created_at)                              | yes  |
| region =, sort created_at (range on created_at)      | capped count               |  2.74 |  3.09 | Aggregate → Limit → Index Only Scan (orders_qs_region\_\_created_at)             | yes  |
| region =, sort created_at (range on created_at)      | capped total               | 12.15 | 14.08 | Aggregate → Limit → Index Scan (orders_qs_region\_\_created_at)                  | yes  |
| region =, sort created_at (range on created_at)      | range, first page desc     |  0.95 |  1.10 | Limit → Index Scan (orders_qs_region\_\_created_at)                              | yes  |
| region =, sort created_at (range on created_at)      | range, capped count        |  2.77 |  3.00 | Aggregate → Limit → Index Only Scan (orders_qs_region\_\_created_at)             | yes  |
| channel =, sort created_at                           | first page desc            |  0.88 |  0.96 | Limit → Index Scan (orders_qs_channel\_\_created_at)                             | yes  |
| channel =, sort created_at                           | deep keyset page desc      |  0.97 |  1.07 | Limit → Index Scan (orders_qs_channel\_\_created_at)                             | yes  |
| channel =, sort created_at                           | first page asc             |  0.86 |  0.97 | Limit → Index Scan (orders_qs_channel\_\_created_at)                             | yes  |
| channel =, sort created_at                           | deep keyset page asc       |  0.95 |  1.07 | Limit → Index Scan (orders_qs_channel\_\_created_at)                             | yes  |
| channel =, sort created_at                           | capped count               |  5.92 |  6.48 | Aggregate → Limit → Index Only Scan (orders_qs_status_code**channel**created_at) | yes  |
| channel =, sort created_at                           | capped total               | 10.97 | 12.29 | Aggregate → Limit → Index Scan (orders_qs_channel\_\_created_at)                 | yes  |
| status_code =, region =, sort created_at             | first page desc            |  0.92 |  1.04 | Limit → Index Scan (orders_qs_status_code**region**created_at)                   | yes  |
| status_code =, region =, sort created_at             | deep keyset page desc      |  1.01 |  1.09 | Limit → Index Scan (orders_qs_status_code**region**created_at)                   | yes  |
| status_code =, region =, sort created_at             | first page asc             |  0.93 |  1.20 | Limit → Index Scan (orders_qs_status_code**region**created_at)                   | yes  |
| status_code =, region =, sort created_at             | deep keyset page asc       |  0.99 |  1.10 | Limit → Index Scan (orders_qs_status_code**region**created_at)                   | yes  |
| status_code =, region =, sort created_at             | capped count               |  2.86 |  3.07 | Aggregate → Limit → Index Only Scan (orders_qs_status_code**region**created_at)  | yes  |
| status_code =, region =, sort created_at             | capped total               | 12.47 | 14.29 | Aggregate → Limit → Index Scan (orders_qs_status_code**region**created_at)       | yes  |
| status_code =, channel =, sort created_at            | first page desc            |  0.90 |  0.96 | Limit → Index Scan (orders_qs_status_code**channel**created_at)                  | yes  |
| status_code =, channel =, sort created_at            | deep keyset page desc      |  0.98 |  1.15 | Limit → Index Scan (orders_qs_status_code**channel**created_at)                  | yes  |
| status_code =, channel =, sort created_at            | first page asc             |  0.91 |  1.09 | Limit → Index Scan (orders_qs_status_code**channel**created_at)                  | yes  |
| status_code =, channel =, sort created_at            | deep keyset page asc       |  1.01 |  1.25 | Limit → Index Scan (orders_qs_status_code**channel**created_at)                  | yes  |
| status_code =, channel =, sort created_at            | capped count               |  2.85 |  3.87 | Aggregate → Limit → Index Only Scan (orders_qs_status_code**channel**created_at) | yes  |
| status_code =, channel =, sort created_at            | capped total               | 12.78 | 17.10 | Aggregate → Limit → Index Scan (orders_qs_status_code**channel**created_at)      | yes  |
| quick filter over customer_name, order_number        | “Smith”, capped page       |  2.17 |  2.32 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick)                   | yes  |
| quick filter over customer_name, order_number        | “Mokoena”, capped page     |  7.39 | 11.52 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick)                   | yes  |
| quick filter over customer_name, order_number        | “Zanele Dlam”, capped page |  6.44 |  6.74 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick)                   | yes  |
| quick filter over customer_name, order_number        | “mok”, capped page         |  9.88 | 16.02 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick)                   | yes  |
| quick filter over customer_name, order_number        | “a M”, capped page         | 15.03 | 19.00 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick)                   | yes  |
| quick filter over customer_name, order_number        | “12345”, capped page       |  0.46 |  0.51 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick)                   | yes  |
| quick filter over customer_name, order_number        | “ena 4”, capped page       |  9.42 | 10.06 | Limit → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_quick)                   | yes  |
| quick filter over customer_name, order_number        | “---”, capped page         |     – |     – | refused by the server in 33 of 33 runs: over the 120 ms quick filter budget      | yes  |

## Several values per field: 80 of 80 pass

Each ordered index with an equality field, with 2, 5 and the field's cap of values, taken from the most common and then from the rarest. The bar is the same p95 budget and no Seq Scan; a Sort is allowed here and shows in the plan, because `= ANY` over several values has no single index order to read.

| Index                                                | Query                                                   |   p50 |   p95 | Plan                                                                                             | Pass |
| ---------------------------------------------------- | ------------------------------------------------------- | ----: | ----: | ------------------------------------------------------------------------------------------------ | ---- |
| status_code =, sort created_at (range on created_at) | 2 common status_code: first page desc                   |  0.87 |  0.99 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| status_code =, sort created_at (range on created_at) | 2 common status_code: capped count                      |  4.44 |  7.16 | Aggregate → Limit → Index Only Scan (orders_qs_status_code\_\_created_at)                        | yes  |
| status_code =, sort created_at (range on created_at) | 5 common status_code: first page desc                   |  0.85 |  0.96 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| status_code =, sort created_at (range on created_at) | 5 common status_code: capped count                      |  4.33 |  4.52 | Aggregate → Limit → Index Only Scan (orders_qs_status_code\_\_created_at)                        | yes  |
| status_code =, sort created_at (range on created_at) | 7 common status_code: first page desc                   |  0.85 |  0.90 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| status_code =, sort created_at (range on created_at) | 7 common status_code: capped count                      |  4.29 |  4.58 | Aggregate → Limit → Index Only Scan (orders_qs_status_code\_\_created_at)                        | yes  |
| status_code =, sort created_at (range on created_at) | 2 rare status_code: first page desc                     |  7.13 |  7.60 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| status_code =, sort created_at (range on created_at) | 2 rare status_code: capped count                        |  3.37 |  3.54 | Aggregate → Limit → Index Only Scan (orders_qs_status_code\_\_total)                             | yes  |
| status_code =, sort created_at (range on created_at) | 5 rare status_code: first page desc                     |  1.61 |  1.85 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| status_code =, sort created_at (range on created_at) | 5 rare status_code: capped count                        |  4.35 |  4.77 | Aggregate → Limit → Index Only Scan (orders_qs_status_code\_\_created_at)                        | yes  |
| status_code =, sort created_at (range on created_at) | 7 rare status_code: first page desc                     |  0.85 |  0.96 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| status_code =, sort created_at (range on created_at) | 7 rare status_code: capped count                        |  4.24 |  4.59 | Aggregate → Limit → Index Only Scan (orders_qs_status_code\_\_created_at)                        | yes  |
| status_code =, sort total (range on total)           | 2 common status_code: first page desc                   |  0.97 |  1.05 | Limit → Index Scan (orders_qs_total)                                                             | yes  |
| status_code =, sort total (range on total)           | 2 common status_code: capped count                      |  4.46 |  5.07 | Aggregate → Limit → Index Only Scan (orders_qs_status_code\_\_created_at)                        | yes  |
| status_code =, sort total (range on total)           | 5 common status_code: first page desc                   |  0.88 |  0.97 | Limit → Index Scan (orders_qs_total)                                                             | yes  |
| status_code =, sort total (range on total)           | 5 common status_code: capped count                      |  4.21 |  4.81 | Aggregate → Limit → Index Only Scan (orders_qs_status_code\_\_created_at)                        | yes  |
| status_code =, sort total (range on total)           | 7 common status_code: first page desc                   |  0.88 |  1.05 | Limit → Index Scan (orders_qs_total)                                                             | yes  |
| status_code =, sort total (range on total)           | 7 common status_code: capped count                      |  4.37 |  5.90 | Aggregate → Limit → Index Only Scan (orders_qs_status_code\_\_created_at)                        | yes  |
| status_code =, sort total (range on total)           | 2 rare status_code: first page desc                     |  7.59 |  8.14 | Limit → Index Scan (orders_qs_total)                                                             | yes  |
| status_code =, sort total (range on total)           | 2 rare status_code: capped count                        |  3.43 |  4.44 | Aggregate → Limit → Index Only Scan (orders_qs_status_code\_\_total)                             | yes  |
| status_code =, sort total (range on total)           | 5 rare status_code: first page desc                     |  1.67 |  2.03 | Limit → Index Scan (orders_qs_total)                                                             | yes  |
| status_code =, sort total (range on total)           | 5 rare status_code: capped count                        |  4.31 |  4.77 | Aggregate → Limit → Index Only Scan (orders_qs_status_code\_\_created_at)                        | yes  |
| status_code =, sort total (range on total)           | 7 rare status_code: first page desc                     |  0.89 |  0.96 | Limit → Index Scan (orders_qs_total)                                                             | yes  |
| status_code =, sort total (range on total)           | 7 rare status_code: capped count                        |  4.38 |  4.75 | Aggregate → Limit → Index Only Scan (orders_qs_status_code\_\_created_at)                        | yes  |
| customer_id =, sort created_at                       | 2 common customer_id: first page desc                   |  5.78 |  6.14 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| customer_id =, sort created_at                       | 2 common customer_id: capped count                      |  2.73 |  5.56 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id\_\_created_at)                        | yes  |
| customer_id =, sort created_at                       | 5 common customer_id: first page desc                   |  4.27 |  4.67 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| customer_id =, sort created_at                       | 5 common customer_id: capped count                      |  2.73 |  2.84 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id\_\_created_at)                        | yes  |
| customer_id =, sort created_at                       | 20 common customer_id: first page desc                  |  2.98 |  3.91 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| customer_id =, sort created_at                       | 20 common customer_id: capped count                     |  2.79 |  3.43 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id\_\_created_at)                        | yes  |
| customer_id =, sort created_at                       | 2 rare customer_id: first page desc                     |  0.37 |  0.45 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_customer_id\_\_created_at)        | yes  |
| customer_id =, sort created_at                       | 2 rare customer_id: capped count                        |  0.33 |  0.43 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id\_\_created_at)                        | yes  |
| customer_id =, sort created_at                       | 5 rare customer_id: first page desc                     |  0.60 |  0.68 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_customer_id\_\_created_at)        | yes  |
| customer_id =, sort created_at                       | 5 rare customer_id: capped count                        |  0.48 |  0.55 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id\_\_created_at)                        | yes  |
| customer_id =, sort created_at                       | 20 rare customer_id: first page desc                    |  1.54 |  1.71 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_customer_id\_\_created_at)        | yes  |
| customer_id =, sort created_at                       | 20 rare customer_id: capped count                       |  1.12 |  1.79 | Aggregate → Limit → Index Only Scan (orders_qs_customer_id\_\_created_at)                        | yes  |
| region =, sort created_at (range on created_at)      | 2 common region: first page desc                        |  1.30 |  1.56 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| region =, sort created_at (range on created_at)      | 2 common region: capped count                           |  2.75 |  2.95 | Aggregate → Limit → Index Only Scan (orders_qs_region\_\_created_at)                             | yes  |
| region =, sort created_at (range on created_at)      | 5 common region: first page desc                        |  1.06 |  1.17 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| region =, sort created_at (range on created_at)      | 5 common region: capped count                           |  4.39 |  5.71 | Aggregate → Limit → Index Only Scan (orders_qs_region\_\_created_at)                             | yes  |
| region =, sort created_at (range on created_at)      | 20 common region: first page desc                       |  0.88 |  0.97 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| region =, sort created_at (range on created_at)      | 20 common region: capped count                          |  4.34 |  4.76 | Aggregate → Limit → Index Only Scan (orders_qs_region\_\_created_at)                             | yes  |
| region =, sort created_at (range on created_at)      | 2 rare region: first page desc                          | 16.08 | 18.80 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| region =, sort created_at (range on created_at)      | 2 rare region: capped count                             |  3.13 |  3.51 | Aggregate → Limit → Index Only Scan (orders_qs_region\_\_created_at)                             | yes  |
| region =, sort created_at (range on created_at)      | 5 rare region: first page desc                          |  7.11 |  9.35 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| region =, sort created_at (range on created_at)      | 5 rare region: capped count                             |  4.24 |  4.86 | Aggregate → Limit → Index Only Scan (orders_qs_region\_\_created_at)                             | yes  |
| region =, sort created_at (range on created_at)      | 20 rare region: first page desc                         |  1.79 |  2.24 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| region =, sort created_at (range on created_at)      | 20 rare region: capped count                            |  3.72 |  5.95 | Aggregate → Limit → Index Only Scan (orders_qs_region\_\_created_at)                             | yes  |
| channel =, sort created_at                           | 2 common channel: first page desc                       |  0.85 |  0.91 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| channel =, sort created_at                           | 2 common channel: capped count                          |  4.15 |  6.25 | Aggregate → Limit → Index Only Scan (orders_qs_channel\_\_created_at)                            | yes  |
| channel =, sort created_at                           | 5 common channel: first page desc                       |  0.84 |  0.93 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| channel =, sort created_at                           | 5 common channel: capped count                          |  4.11 |  4.38 | Aggregate → Limit → Index Only Scan (orders_qs_channel\_\_created_at)                            | yes  |
| channel =, sort created_at                           | 2 rare channel: first page desc                         |  4.80 |  5.54 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| channel =, sort created_at                           | 2 rare channel: capped count                            |  4.16 |  4.41 | Aggregate → Limit → Index Only Scan (orders_qs_channel\_\_created_at)                            | yes  |
| channel =, sort created_at                           | 5 rare channel: first page desc                         |  0.87 |  0.98 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| channel =, sort created_at                           | 5 rare channel: capped count                            |  4.13 |  4.53 | Aggregate → Limit → Index Only Scan (orders_qs_channel\_\_created_at)                            | yes  |
| status_code =, region =, sort created_at             | 2 common status_code, 2 common region: first page desc  |  1.53 |  1.83 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| status_code =, region =, sort created_at             | 2 common status_code, 2 common region: capped count     |  2.84 |  2.95 | Aggregate → Limit → Index Only Scan (orders_qs_status_code**region**created_at)                  | yes  |
| status_code =, region =, sort created_at             | 5 common status_code, 5 common region: first page desc  |  1.09 |  1.21 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| status_code =, region =, sort created_at             | 5 common status_code, 5 common region: capped count     |  4.29 |  4.70 | Aggregate → Limit → Index Only Scan (orders_qs_status_code**region**created_at)                  | yes  |
| status_code =, region =, sort created_at             | 7 common status_code, 20 common region: first page desc |  0.95 |  1.05 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| status_code =, region =, sort created_at             | 7 common status_code, 20 common region: capped count    |  4.69 |  7.96 | Aggregate → Limit → Index Only Scan (orders_qs_status_code**region**created_at)                  | yes  |
| status_code =, region =, sort created_at             | 2 rare status_code, 2 rare region: first page desc      |  0.95 |  1.02 | Limit → Sort → Index Scan (orders_qs_status_code**region**created_at)                            | yes  |
| status_code =, region =, sort created_at             | 2 rare status_code, 2 rare region: capped count         |  0.52 |  1.10 | Aggregate → Limit → Index Only Scan (orders_qs_status_code**region**created_at)                  | yes  |
| status_code =, region =, sort created_at             | 5 rare status_code, 5 rare region: first page desc      | 25.67 | 29.21 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| status_code =, region =, sort created_at             | 5 rare status_code, 5 rare region: capped count         |  3.16 |  3.65 | Aggregate → Limit → Index Only Scan (orders_qs_status_code**region**created_at)                  | yes  |
| status_code =, region =, sort created_at             | 7 rare status_code, 20 rare region: first page desc     |  1.88 |  2.14 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| status_code =, region =, sort created_at             | 7 rare status_code, 20 rare region: capped count        |  4.85 |  5.65 | Aggregate → Limit → Index Only Scan (orders_qs_status_code**region**created_at)                  | yes  |
| status_code =, channel =, sort created_at            | 2 common status_code, 2 common channel: first page desc |  1.02 |  1.43 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| status_code =, channel =, sort created_at            | 2 common status_code, 2 common channel: capped count    |  4.82 |  7.94 | Aggregate → Limit → Index Only Scan (orders_qs_status_code**channel**created_at)                 | yes  |
| status_code =, channel =, sort created_at            | 5 common status_code, 5 common channel: first page desc |  0.87 |  0.97 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| status_code =, channel =, sort created_at            | 5 common status_code, 5 common channel: capped count    |  3.20 |  3.44 | Aggregate → Limit → Index Only Scan (orders_qs_status_code**channel**created_at)                 | yes  |
| status_code =, channel =, sort created_at            | 7 common status_code, 5 common channel: first page desc |  0.91 |  0.98 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| status_code =, channel =, sort created_at            | 7 common status_code, 5 common channel: capped count    |  3.21 |  3.47 | Aggregate → Limit → Index Only Scan (orders_qs_status_code**channel**created_at)                 | yes  |
| status_code =, channel =, sort created_at            | 2 rare status_code, 2 rare channel: first page desc     |  3.55 |  3.90 | Limit → Sort → Bitmap Heap Scan → Bitmap Index Scan (orders_qs_status_code**channel**created_at) | yes  |
| status_code =, channel =, sort created_at            | 2 rare status_code, 2 rare channel: capped count        |  0.92 |  1.17 | Aggregate → Limit → Index Only Scan (orders_qs_status_code**channel**created_at)                 | yes  |
| status_code =, channel =, sort created_at            | 5 rare status_code, 5 rare channel: first page desc     |  1.68 |  1.86 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| status_code =, channel =, sort created_at            | 5 rare status_code, 5 rare channel: capped count        |  3.25 |  3.49 | Aggregate → Limit → Index Only Scan (orders_qs_status_code**channel**created_at)                 | yes  |
| status_code =, channel =, sort created_at            | 7 rare status_code, 5 rare channel: first page desc     |  0.89 |  0.98 | Limit → Index Scan (orders_qs_created_at)                                                        | yes  |
| status_code =, channel =, sort created_at            | 7 rare status_code, 5 rare channel: capped count        |  3.21 |  3.42 | Aggregate → Limit → Index Only Scan (orders_qs_status_code**channel**created_at)                 | yes  |

## Counts and totals from the counter table: 1 of 1 pass

One read answers the facet counts, the count and every total of a query that filters on the facet alone. The table holds one row per facet value, so the bar is the p95 budget alone.

| Index                | Query                                         |  p50 |  p95 | Plan     | Pass |
| -------------------- | --------------------------------------------- | ---: | ---: | -------- | ---- |
| status_code counters | every count and the sums of total, item_count | 0.23 | 0.26 | Seq Scan | yes  |

No index is declared `multi: false`.
