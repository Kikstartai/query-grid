# Property testing

The procedure lives in the `property-tests` skill of the kikstart plugin: give it a source file and it writes the fast-check property tests the file deserves, then acts on every counterexample.

This repo's worked example is [`query-url.test.ts`](../packages/query-grid/src/model/query-url.test.ts). Its tests run at 100 cases by default, and `FC_RUNS=10000` runs a deep pass.
