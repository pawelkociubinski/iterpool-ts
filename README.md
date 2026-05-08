# iterpool-ts

Tiny, type-safe concurrency pool for TypeScript.

`iterpool-ts` runs lazily defined concurrent functions with a hard concurrency cap. It preserves input order, captures synchronous throws and asynchronous rejections, and gives you two clean ways to work:

- `runConcurrentPromises` for `success`, `partial-success`, and `error`
- `concurrency` for full settled results per input slot

If you like the execution model of a worker pool more than a queue-based promise limiter, this package is built for that style.

## Install

```bash
npm install iterpool-ts
```

## Why iterpool-ts

- Shared-iterator worker-pool architecture
- Lazy function start instead of eager scheduling
- Deterministic output order even when completion order differs
- Strong tuple inference
- Explicit handling of partial success
- Small API surface with zero framework assumptions

## Quick Start

Pass functions, not already started promises. This allows workers to control when execution begins and guarantees the concurrency limit is respected.

```ts
import { runConcurrentPromises } from 'iterpool-ts';

const result = await runConcurrentPromises({
  promises: [
    () => Promise.resolve('foo'),
    () => Promise.resolve('bar'),
    () => Promise.resolve(['baz', 'qux']),
  ],
  limit: 2,
});

switch (result.status) {
  case 'success': {
    const [foo, bar, bazQux] = result.value;

    console.log(foo); // "foo"
    console.log(bar); // "bar"
    console.log(bazQux); // ["baz", "qux"]
    break;
  }

  case 'partial-success': {
    break;
  }

  case 'error': {
    break;
  }
}
```

## What Makes It Different

Most promise utilities focus on wrapping already-known async flows. `iterpool-ts` is closer to a worker pool:

- functions are pulled lazily from a shared iterator
- concurrency comes from a bounded number of workers
- the iterator acts as the source of truth for pending work

## Choose Your API

### `runConcurrentPromises`

Use this when you want an application-friendly result shape.

```ts
const result = await runConcurrentPromises({
  promises,
  limit: 3,
});
```

Returned states:

- `success`: every function fulfilled, `value` contains all results in input order
- `partial-success`: some functions fulfilled and some rejected, `value` contains fulfilled values in input order and `error.errors` contains rejected reasons
- `error`: every function rejected, `value` is `undefined` and `error.errors` contains all rejected reasons

### `concurrency`

Use this when you need raw settled results for every input slot.

```ts
import { concurrency } from 'iterpool-ts';

const settled = await concurrency(
  [
    () => Promise.resolve('first'),
    () => Promise.reject(new Error('boom')),
    () => 42,
  ],
  { limit: 2 },
).start();

console.log(settled);
// [
//   { status: 'fulfilled', value: 'first' },
//   { status: 'rejected', reason: Error('boom') },
//   { status: 'fulfilled', value: 42 },
// ]
```

### `AggregateError`

`iterpool-ts` exports a typed `AggregateError<T>` for grouped failures:

```ts
import { AggregateError } from 'iterpool-ts';

const error = new AggregateError([new Error('foo'), new Error('bar')]);

console.log(error.name); // "AggregateError"
console.log(error.message); // "Multiple errors occurred"
console.log(error.errors); // [Error("foo"), Error("bar")]
```

## TypeScript Experience

When you declare functions as a tuple, successful results keep tuple order and per-position types:

```ts
const result = await runConcurrentPromises({
  promises: [
    () => Promise.resolve(123),
    () => Promise.resolve('abc'),
    () => Promise.resolve(true),
  ],
});

if (result.status === 'success') {
  const [id, label, state] = result.value;
  // id: number
  // label: string
  // state: boolean
}
```

## Compared With Familiar Tools

| Tool                 | Scheduling style            | Result model                                  | Type precision         |
| -------------------- | --------------------------- | --------------------------------------------- | ---------------------- |
| `Promise.all`        | eager                       | fail-fast                                     | generic                |
| `Promise.allSettled` | eager                       | per-task settled results                      | generic                |
| `p-limit`            | queue-driven limiter        | user-defined                                  | generic                |
| `iterpool-ts`        | shared-iterator worker pool | high-level union or low-level settled results | strong tuple inference |

## Behavior Guarantees

- `limit` defaults to `Infinity`
- `concurrency` returns one settled result per input slot
- fulfilled values and rejected reasons preserve function declaration order
- functions are started lazily by workers
- synchronous throws and asynchronous rejections become rejected results
- an empty input list resolves successfully with `[]`

## Good Fit For

- batched API or database work
- SDK and integration orchestration
- worker-style processing pipelines
- mixed sync/async function lists
- strongly typed multi-step flows where order matters

## Development

This repository uses Nx. Useful local commands:

```bash
npx nx test iterpool-ts
npx nx build iterpool-ts
npx nx lint iterpool-ts
npx nx typecheck iterpool-ts
```

## License

MIT
