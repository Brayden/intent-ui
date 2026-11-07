# Testing

Tests exist to catch regressions in behavior that matters and to make refactoring safe.
They are not a coverage target. A test that only restates the implementation is a cost,
not a benefit.

## Decide: does this need a test?

**Write a test when the code:**

- Contains real logic: parsing, validation, transformation, state machines, reducers,
  routing/matching, merging, diffing, scoring, retries.
- Sits at a boundary that's easy to break silently: Worker route handlers, schemas for
  external or LLM-produced data, provider adapters, serialization.
- Fixed a bug — add a test that would have caught it.
- Is a shared/reusable unit other code depends on (`lib/`, shared hooks).
- Has edge cases you had to think hard about (empty input, partial streams, unicode,
  time zones, concurrency).

**Skip the test when the code:**

- Is pure layout or styling, or a thin wrapper that just passes props to a Kumo component.
- Is configuration, constants, or type declarations.
- Is a prototype or spike that's explicitly throwaway (say so in the summary).
- Would only be tested by mocking everything it does — test the logic it calls instead.

When skipping, say in the change summary why no test was needed. "Not needed: presentational
component with no logic" is a fine answer.

## Tooling (add on first real need)

No test runner is installed yet. When the first test is warranted, set up:

- **Vitest** for `src/` logic and hooks (`vitest`, `@testing-library/react`, `jsdom`
  when a component test is truly needed).
- **`@cloudflare/vitest-pool-workers`** for `worker/` code, so tests run in `workerd`
  with real bindings instead of mocks.
- Add `"test": "vitest"` to `package.json` and document it in the README.

## Writing good tests

- **Test behavior, not implementation.** Assert on outputs, rendered text, returned
  responses — not on internal state or which private function got called.
- **Co-locate:** `parseIntent.ts` → `parseIntent.test.ts` in the same folder.
- **Name by behavior:** `it("rejects intents without an action")`, not `it("works")`.
- **One reason to fail per test.** Arrange / act / assert, clearly separated.
- **Table-driven** (`it.each`) for many input → output cases.
- **Minimal mocking.** Mock only the network edge or nondeterminism (time, randomness,
  LLM calls). Prefer real implementations and in-memory fakes.
- **Fixtures** live next to the tests that use them, or in `__fixtures__/` when shared.
  Keep them small and readable.
- **Deterministic.** No reliance on real time, network, or test order.
- **Fast.** A unit test that takes more than ~100ms is probably testing too much.

## UI tests

Component tests are the exception, not the default. Write one only when a component has
interaction logic that a hook test can't cover (e.g. keyboard flows, conditional
rendering driven by user input). Query by role and label (`getByRole`), never by class name.
