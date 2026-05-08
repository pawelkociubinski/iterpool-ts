# iterpool-ts

Tiny, type-safe concurrency pool for TypeScript.

`iterpool-ts` runs lazily defined concurrent functions with a hard concurrency
cap. It preserves input order, captures both synchronous and asynchronous
failures, and exposes two APIs:

- `runConcurrentPromises` for an application-friendly `success` / `partial-success` / `error` result
- `concurrency` for low-level settled results per input slot

## Install

```bash
npm install iterpool-ts
```

## Quick Start

Pass functions, not already-started promises. The package starts them lazily so
the concurrency limit can be enforced.

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
    console.log(result.value); // fulfilled values in input order
    console.log(result.error.errors); // rejected reasons in input order
    break;
  }

  case 'error': {
    console.log(result.error.errors); // all rejected reasons in input order
    break;
  }
}
```

## Public API

### `runConcurrentPromises`

Use `runConcurrentPromises` when you want a high-level result shape.

```ts
import { runConcurrentPromises } from 'iterpool-ts';

const result = await runConcurrentPromises({
  promises: [
    () => Promise.resolve(123),
    () => 'abc',
    () => Promise.resolve(true),
  ],
  limit: 2,
});
```

Returned states:

- `success`: every function fulfilled; `value` contains all values in input order and `error` is `undefined`
- `partial-success`: some functions fulfilled and some rejected; `value` contains fulfilled values in input order and `error.errors` contains rejected reasons in input order
- `error`: every function rejected; `value` is `undefined` and `error.errors` contains all rejected reasons in input order

When the input is declared as a tuple, successful results preserve per-position
types:

```ts
const result = await runConcurrentPromises({
  promises: [
    () => Promise.resolve(123),
    () => Promise.resolve('abc'),
    () => Promise.resolve(true),
  ] as const,
});

if (result.status === 'success') {
  const [id, label, active] = result.value;
  // id: number
  // label: string
  // active: boolean
}
```

### `concurrency`

Use `concurrency` when you need the settled result for every input slot.

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

`limit` defaults to `Infinity`. If provided, it must be a positive integer or
`Infinity`.

### `ok` and `err`

Functions may return `ok(value)` or `err(error)` directly. `concurrency` and
`runConcurrentPromises` treat them as settled results instead of plain values.

```ts
import { err, ok, runConcurrentPromises } from 'iterpool-ts';

const validationError = new Error('Invalid input');

const result = await runConcurrentPromises({
  promises: [
    () => ok('accepted'),
    () => err(validationError),
    () => Promise.resolve(ok(123)),
  ],
  limit: 2,
});

if (result.status === 'partial-success') {
  console.log(result.value); // ["accepted", 123]
  console.log(result.error.errors); // [validationError]
}
```

### `resultAdapter`

Use `resultAdapter` when your functions return another Result-like type. The
adapter receives each fulfilled function output and must return `ok(...)` or
`err(...)`.

```ts
import { err, ok, runConcurrentPromises } from 'iterpool-ts';

type ExternalResult<TValue, TError> =
  | { type: 'ok'; value: TValue }
  | { type: 'error'; error: TError };

const externalOk = <TValue>(value: TValue): ExternalResult<TValue, never> => ({
  type: 'ok',
  value,
});

const externalErr = <TError>(error: TError): ExternalResult<never, TError> => ({
  type: 'error',
  error,
});

const result = await runConcurrentPromises({
  promises: [
    () => externalOk('foo'),
    () => externalErr(new Error('boom')),
    () => Promise.resolve(externalOk(123)),
  ] as const,
  limit: 2,
  resultAdapter: (result) => {
    if (result.type === 'ok') {
      return ok(result.value);
    }

    return err(result.error);
  },
});
```

Thrown errors and rejected promises are captured as rejected results directly;
they are not passed through `resultAdapter`.

### `AggregateError`

`runConcurrentPromises` groups rejected reasons in a typed `AggregateError<T>`.

```ts
import { AggregateError } from 'iterpool-ts';

const error = new AggregateError([new Error('foo'), new Error('bar')]);

console.log(error.name); // "AggregateError"
console.log(error.message); // "Multiple errors occurred"
console.log(error.errors); // [Error("foo"), Error("bar")]
```

## Exported Types

The package exports the public types needed to describe inputs and results:

- `ConcurrentFunction`
- `ConcurrentFunctionSettledResult`
- `FulfilledResult`
- `RejectedResult`
- `SettledResult`
- `ResultAdapter`
- `ResultLike`
- `RunConcurrentPromisesParams`
- `RunConcurrentPromisesResult`

## Behavior Guarantees

- functions are started lazily by workers
- `limit` defaults to `Infinity`
- `concurrency` returns one settled result per input slot
- fulfilled values and rejected reasons preserve declaration order
- synchronous throws and asynchronous rejections become rejected results
- `ok(value)` becomes a fulfilled result with `value`
- `err(error)` becomes a rejected result with `error`
- an empty input resolves successfully with `[]`

## License

MIT
