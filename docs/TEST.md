# Property testing

How to read a source file and write the property tests it deserves. Written as a procedure so it can become a skill: given a file, find its properties, build its generators, write the tests, and act on what they find. The framing follows [How the Claude Code team thinks about verification](https://claude.dev/blog/how-the-claude-code-team-thinks-about-verification/).

## The idea

An example test fixes an input and its expected output, so it checks only what its author thought of. A property test states a rule that holds for every input in a domain and lets a library generate the inputs. The rule needs no expected output, only a relationship that must hold, so a machine can check thousands of inputs it never saw before.

That matters most when an agent writes both the code and its tests: example tests share the code's blind spots, generated inputs do not. When a rule fails, the library shrinks the input to the smallest one that still fails and prints a seed that replays it.

Use [fast-check](https://fast-check.dev) for TypeScript, as a dev dependency of the package under test.

## 1. Find the candidates

Read the file's exports and how the rest of the repo calls them. A function is a candidate when it is:

- **pure and in memory**: no I/O, no DOM, no clock or randomness it does not take as an argument;
- **fed input nobody chose by hand**: a URL, a request body, stored JSON, a file, user text;
- **one half of a pair**: encode and decode, parse and print, serialize and read;
- **a transformation that must keep something**: normalize, sort, merge, plan, filter.

Skip code that renders, queries a database or waits. Its properties are real, but each run is too slow; keep example and end-to-end tests there.

## 2. Pick properties from how the code is used

Do not fill a list. For each candidate, ask what the callers rely on, and write that down as a rule. Each kind below has a signal to look for in the code.

| Kind           | Rule                                                       | Signal in the code                                                                          |
| -------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Round trip     | `decode(encode(x))` equals `x`                             | an `encode`/`decode`, `parse`/`format` or `to*`/`from*` pair                                |
| Canonical form | `x` equals `y` exactly when `encode(x)` equals `encode(y)` | callers compare encoded strings, use them as cache or memo keys, or skip work when equal    |
| Idempotence    | `f(f(x))` equals `f(x)`                                    | a `normalize*`, a migration, a retry, or a result written back where it is read again       |
| Invariant      | `check(f(x))` is always true                               | a cap, a bound, an allow-list, "never throws", "every output key is a known key"            |
| Equivalence    | `fast(x)` equals `naive(x)`                                | two implementations of one thing: an index and a scan, a cache and a recompute, two sources |
| Monotonicity   | a bigger input never gives a smaller output                | counts, limits, filters that only narrow                                                    |

Write each rule as one sentence before writing code, with the caller that depends on it. A rule nobody depends on is not worth a test.

In `query-url.ts`, for example, the encoder and decoder are a pair (round trip); url-sync compares encoded strings (canonical form); url-sync writes the normalized URL back to the address bar (idempotence); the server decodes raw requests (never throws). There is no second implementation, so no equivalence.

## 3. Define the domain

A property holds only over the right inputs. Over every value of the type, almost any round trip fails; over the values the code can actually receive, it should not. Most of the work is writing a generator for that domain.

- **Valid inputs**: build them from the same definitions the code validates against (field lists, enums, limits), not from free strings. Then assert, inside the test, that each one passes the code's own validator and is unchanged by its normalizer, so the generator cannot drift from what valid means.
- **Hostile inputs**: for anything that accepts untrusted data, add a second generator for raw input: real keys mixed with junk, empty values, the format's own separators, unicode, repeats. Use it for "never throws" and idempotence.
- **Bias toward edges**: empty, one, the cap, the cap plus one, separators, duplicates. fast-check does some of this already; add the format's own special characters yourself.
- **Check coverage**: sample the generator once and confirm every branch you care about appears in a fair share of cases. A property that never sees an excluded range proves nothing about excluded ranges.

## 4. Write the tests

One test per property, named after the rule.

```ts
const RUNS = Number(process.env.FC_RUNS ?? 100);

test("a valid query survives encode and decode", () => {
  fc.assert(
    fc.property(arbitraryQuery, (query) => {
      expect(decode(encode(query))).toEqual(query);
    }),
    { numRuns: RUNS },
  );
});
```

Keep the default run count low for every change and raise it with `FC_RUNS` for a deep run before a release.

## 5. Act on a failure

A failing property prints a shrunk counterexample. Decide which of three it is:

1. **A valid input the code gets wrong**: a real bug. Pin the counterexample as an ordinary example test, fix the code, and keep the generator wide. The first run on `query-url.ts` found one: an empty cursor is valid but the encoder dropped it.
2. **An input validation already rejects**: the generator is too wide. Tighten the generator, never the rule.
3. **A valid input the code cannot handle by design**: make it a decision, not an accident. Steer the generator around it and record why in the test file, and fix the validator if it should have rejected the input.

Never weaken a rule to make it pass.

## 6. Keep the cost honest

Pure functions are cheap: a round trip in this repo costs microseconds, so a property at 100 runs takes a few tens of milliseconds and stays in the normal suite. Shrinking runs only when a test already fails. A seed from a failure replays the exact input. If a property needs I/O to run, it belongs in a slower suite or as an example test.

## Checklist for a file

- Candidates listed, with the input source for each.
- Each property written as one sentence with the caller that relies on it.
- A valid-input generator built from the code's own definitions, checked against its validator and normalizer.
- A hostile-input generator for anything that takes untrusted data.
- One test per property, run count from `FC_RUNS`.
- Every counterexample classified: fixed and pinned, generator tightened, or excluded with a reason.
