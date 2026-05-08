import { AggregateError } from './aggregate-error.js';
import {
  err,
  ok,
  type ConcurrentFunction,
  type ResultLike,
} from './concurrency.js';
import {
  simulateAsyncOperation,
  simulateSyncOperation,
  simulateThrownAsyncOperation,
  simulateThrownSyncOperation,
} from './promise.mock.js';
import {
  runConcurrentPromises,
  RunConcurrentPromisesResult,
} from './run-concurrent-promises.js';

type Assert<T extends true> = T;
type IsEqual<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends <T>() => T extends TRight ? 1 : 2
    ? true
    : false;

type SuccessResult<
  T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
> = Extract<RunConcurrentPromisesResult<T, TResult>, { status: 'success' }>;
type ErrorResult<
  T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
> = Extract<RunConcurrentPromisesResult<T, TResult>, { status: 'error' }>;
type PartialSuccessResult<
  T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
> = Extract<
  RunConcurrentPromisesResult<T, TResult>,
  { status: 'partial-success' }
>;

type ExternalResult<TValue, TError> =
  | { status: 'ok'; value: TValue }
  | { status: 'error'; error: TError };

class FooError extends Error {
  readonly code = 'foo';

  override name = 'FooError';
}

class BarError extends Error {
  readonly code = 'bar';

  override name = 'BarError';
}

function assertType<T extends true>(value: T): T {
  return value;
}

function externalOk<TValue>(value: TValue): ExternalResult<TValue, never> {
  return {
    status: 'ok',
    value,
  };
}

function externalErr<TError>(error: TError): ExternalResult<never, TError> {
  return {
    status: 'error',
    error,
  };
}

function expectSuccess<
  T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
>(
  result: RunConcurrentPromisesResult<T, TResult>,
): asserts result is SuccessResult<T, TResult> {
  expect(result.status).toBe('success');

  if (result.status !== 'success') {
    throw new Error(`Expected success, received ${result.status}`);
  }
}

function expectError<
  T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
>(
  result: RunConcurrentPromisesResult<T, TResult>,
): asserts result is ErrorResult<T, TResult> {
  expect(result.status).toBe('error');

  if (result.status !== 'error') {
    throw new Error(`Expected error, received ${result.status}`);
  }
}

function expectPartialSuccess<
  T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
>(
  result: RunConcurrentPromisesResult<T, TResult>,
): asserts result is PartialSuccessResult<T, TResult> {
  expect(result.status).toBe('partial-success');

  if (result.status !== 'partial-success') {
    throw new Error(`Expected partial-success, received ${result.status}`);
  }
}

async function runWithTimers<T extends readonly ConcurrentFunction[]>(params: {
  promises: readonly [...T];
  limit?: number;
}): Promise<RunConcurrentPromisesResult<T>> {
  const result = runConcurrentPromises(params);

  await vi.runAllTimersAsync();

  return result;
}

describe('runConcurrentPromises', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('should preserve declared order including undefined values', async () => {
    // given
    const promises = [
      () => simulateAsyncOperation(undefined, 100),
      () => simulateAsyncOperation(2, 200),
      () => simulateAsyncOperation(3, 300),
    ] as const;

    // when
    const results = await runWithTimers({ limit: 1, promises });

    // then
    expectSuccess(results);
    expect(results.value).toEqual([undefined, 2, 3]);
    expect(results.error).toBeUndefined();
  });

  test('should resolve all promises successfully', async () => {
    // given
    const promises = [
      () => simulateAsyncOperation(1, 100),
      () => simulateAsyncOperation(2, 200),
      () => simulateAsyncOperation(3, 300),
    ] as const;

    // when
    const results = await runWithTimers({ limit: 1, promises });

    // then
    expectSuccess(results);
    expect(results.value).toEqual([1, 2, 3]);
    expect(results.error).toBeUndefined();
  });

  test('should resolve synchronous and asynchronous operations successfully', async () => {
    // given
    const promises = [
      () => simulateSyncOperation('foo'),
      () => simulateAsyncOperation('bar', 100),
      () => simulateSyncOperation(123),
    ] as const;

    // when
    const results = await runWithTimers({ limit: 2, promises });

    // then
    expectSuccess(results);
    expect(results.value).toEqual(['foo', 'bar', 123]);
    expect(results.error).toBeUndefined();
  });

  test('should keep values in declaration order when promises finish out of order', async () => {
    // given
    const promises = [
      () => simulateAsyncOperation(1, 300),
      () => simulateAsyncOperation(2, 100),
      () => simulateAsyncOperation(3, 200),
    ] as const;

    // when
    const results = await runWithTimers({ limit: 3, promises });

    // then
    expectSuccess(results);
    expect(results.value).toEqual([1, 2, 3]);
    expect(results.error).toBeUndefined();
  });

  test('should use Infinity as the default concurrency limit', async () => {
    // given
    let activeExecutions = 0;
    let maxActiveExecutions = 0;

    const trackedOperation =
      <TValue>(value: TValue) =>
      async (): Promise<TValue> => {
        activeExecutions += 1;
        maxActiveExecutions = Math.max(maxActiveExecutions, activeExecutions);

        try {
          return await simulateAsyncOperation(value, 100);
        } finally {
          activeExecutions -= 1;
        }
      };

    const promises = [
      trackedOperation(1),
      trackedOperation(2),
      trackedOperation(3),
    ] as const;

    // when
    const results = await runWithTimers({ promises });

    // then
    expectSuccess(results);
    expect(results.value).toEqual([1, 2, 3]);
    expect(maxActiveExecutions).toBe(3);
  });

  test('should limit concurrent executions', async () => {
    // given
    let activeExecutions = 0;
    let maxActiveExecutions = 0;

    const trackedOperation =
      <TValue>(value: TValue) =>
      async (): Promise<TValue> => {
        activeExecutions += 1;
        maxActiveExecutions = Math.max(maxActiveExecutions, activeExecutions);

        try {
          return await simulateAsyncOperation(value, 100);
        } finally {
          activeExecutions -= 1;
        }
      };

    const promises = [
      trackedOperation(1),
      trackedOperation(2),
      trackedOperation(3),
      trackedOperation(4),
    ] as const;

    // when
    const results = await runWithTimers({ limit: 2, promises });

    // then
    expectSuccess(results);
    expect(results.value).toEqual([1, 2, 3, 4]);
    expect(maxActiveExecutions).toBe(2);
  });

  test('should infer tuple types for success values', async () => {
    // given
    const promises = [
      () => simulateAsyncOperation(123, 100),
      () => simulateAsyncOperation('bar', 200),
    ] as const;

    // when
    const results = await runWithTimers({ limit: 2, promises });

    // then
    expectSuccess(results);

    const [fooResult, barResult] = results.value;

    assertType<Assert<IsEqual<typeof fooResult, number>>>(true);
    assertType<Assert<IsEqual<typeof barResult, string>>>(true);
    expect(fooResult).toBe(123);
    expect(barResult).toBe('bar');
    expect(results.value).toEqual([123, 'bar']);
  });

  test('should unwrap successful Result values', async () => {
    // given
    const promises = [() => ok('foo'), () => Promise.resolve(ok(123))] as const;

    // when
    const results = await runWithTimers({ limit: 2, promises });

    // then
    expectSuccess(results);

    const [fooResult, barResult] = results.value;

    assertType<Assert<IsEqual<typeof fooResult, string>>>(true);
    assertType<Assert<IsEqual<typeof barResult, number>>>(true);
    expect(fooResult).toBe('foo');
    expect(barResult).toBe(123);
    expect(results.value).toEqual(['foo', 123]);
  });

  test('should return partial-success if at least one operation fails', async () => {
    // given
    const failure = new FooError('failure');
    const promises = [
      () => simulateThrownAsyncOperation(failure, 100),
      () => simulateAsyncOperation(2, 200),
      () => simulateAsyncOperation(3, 300),
    ] as const;

    // when
    const results = await runWithTimers({ limit: 1, promises });

    // then
    expectPartialSuccess(results);
    expect(results.value).toEqual([2, 3]);
    expect(results.error).toEqual(new AggregateError([failure]));
    expect(results.error.errors).toEqual([failure]);
  });

  test('should keep fulfilled values and rejected reasons in declaration order for partial-success', async () => {
    // given
    const firstError = new FooError('first');
    const secondError = new BarError('second');
    const promises = [
      () => simulateAsyncOperation('first value', 400),
      () => simulateThrownAsyncOperation(firstError, 100),
      () => simulateAsyncOperation('second value', 200),
      () => simulateThrownAsyncOperation(secondError, 300),
    ] as const;

    // when
    const results = await runWithTimers({ limit: 4, promises });

    // then
    expectPartialSuccess(results);
    expect(results.value).toEqual(['first value', 'second value']);
    expect(results.error).toEqual(
      new AggregateError([firstError, secondError]),
    );
    expect(results.error.errors).toEqual([firstError, secondError]);
  });

  test('should unwrap mixed successful and failed Result values', async () => {
    // given
    const failure = new FooError('failure');
    const promises = [
      () => ok('foo'),
      () => Promise.resolve(err(failure)),
      () => ok(123),
    ] as const;

    // when
    const results = await runWithTimers({ limit: 2, promises });

    // then
    expectPartialSuccess(results);
    expect(results.value).toEqual(['foo', 123]);
    expect(results.error).toEqual(new AggregateError([failure]));
    expect(results.error.errors).toEqual([failure]);
  });

  test('should pass resultAdapter to concurrency', async () => {
    // given
    const failure = new FooError('failure');
    const promises = [
      () => simulateAsyncOperation(externalOk('foo'), 100),
      () => simulateAsyncOperation(externalErr(failure), 200),
      () => externalOk(123),
    ] as const;
    const resultAdapter = (
      result: Awaited<ReturnType<(typeof promises)[number]>>,
    ) => {
      if (result.status === 'ok') {
        return ok(result.value);
      }

      return err(result.error);
    };

    // when
    const resultsPromise = runConcurrentPromises({
      limit: 2,
      promises,
      resultAdapter,
    });

    await vi.runAllTimersAsync();

    const results = await resultsPromise;

    // then
    expectPartialSuccess(results);

    const [firstValue, secondValue] = results.value;

    assertType<Assert<IsEqual<typeof firstValue, string | number>>>(true);
    assertType<Assert<IsEqual<typeof secondValue, string | number>>>(true);
    assertType<Assert<IsEqual<typeof results.error.errors, readonly FooError[]>>>(
      true,
    );
    expect(firstValue).toBe('foo');
    expect(secondValue).toBe(123);
    expect(results.value).toEqual(['foo', 123]);
    expect(results.error).toEqual(new AggregateError([failure]));
    expect(results.error.errors).toEqual([failure]);
  });

  test('should return an error if all operations fail', async () => {
    // given
    const firstError = new FooError('first');
    const secondError = new BarError('second');
    const thirdError = new FooError('third');
    const promises = [
      () => simulateThrownAsyncOperation(firstError, 300),
      () => simulateThrownSyncOperation(secondError),
      () => simulateThrownAsyncOperation(thirdError, 100),
    ] as const;

    // when
    const results = await runWithTimers({ limit: 3, promises });

    // then
    expectError(results);
    expect(results.value).toBeUndefined();
    expect(results.error).toEqual(
      new AggregateError([firstError, secondError, thirdError]),
    );
    expect(results.error.errors).toEqual([firstError, secondError, thirdError]);
  });

  test('should unwrap failed Result values into an AggregateError', async () => {
    // given
    const fooError = new FooError('foo');
    const barError = new BarError('bar');
    const promises = [
      () => err(fooError),
      () => Promise.resolve(err(barError)),
    ] as const;

    // when
    const results = await runWithTimers({ limit: 2, promises });

    // then
    expectError(results);
    assertType<
      Assert<
        IsEqual<typeof results.error.errors, readonly (FooError | BarError)[]>
      >
    >(true);
    expect(results.value).toBeUndefined();
    expect(results.error).toEqual(new AggregateError([fooError, barError]));
    expect(results.error.errors).toEqual([fooError, barError]);
  });

  test('should collect thrown rejected reasons at runtime', async () => {
    // given
    const failure = new FooError('failure');
    const promises = [() => simulateThrownSyncOperation(failure)] as const;

    // when
    const results = await runWithTimers({ limit: 1, promises });

    // then
    expectError(results);
    expect(results.error.errors).toEqual([failure]);
  });

  test('should handle an empty promise array', async () => {
    // when
    const results = await runWithTimers({ limit: 1, promises: [] });

    // then
    expectSuccess(results);
    expect(results.value).toEqual([]);
    expect(results.error).toBeUndefined();
  });

  test.each([0, -1, 1.5, Number.NaN])(
    'should reject invalid concurrency limit %s',
    async (limit) => {
      // given
      const promises = [() => simulateSyncOperation('foo')] as const;

      // when / then
      await expect(runConcurrentPromises({ limit, promises })).rejects.toThrow(
        TypeError,
      );
    },
  );
});
