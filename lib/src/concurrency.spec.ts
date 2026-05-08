import { concurrency, err, ok, type SettledResult } from './concurrency.js';
import {
  simulateAsyncOperation,
  simulateSyncOperation,
  simulateThrownAsyncOperation,
  simulateThrownSyncOperation,
} from './promise.mock.js';
import { getFulfilledResults, getRejectedResults } from './promise-result.js';

class TestError extends Error {
  override name = 'TestError';
}

type Assert<T extends true> = T;
type IsEqual<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends <T>() => T extends TRight ? 1 : 2
    ? true
    : false;

describe('concurrency', () => {
  // Considering a buffer to account for the overhead of promise scheduling and execution.
  const bufferTime = 50; // Adjst this based on observed performance needs.

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return fulfilled results', async () => {
    // given
    const promises = [
      () => simulateSyncOperation('foo'),
      () => simulateAsyncOperation('bar', 100),
    ];
    // when

    const PromiseResults = concurrency(promises).start();

    await vi.runAllTimersAsync();

    const results = await PromiseResults;
    const fulfilledResults = getFulfilledResults(results);

    // then
    expect(fulfilledResults).toEqual([
      { status: 'fulfilled', value: 'foo' },
      { status: 'fulfilled', value: 'bar' },
    ]);
    expect(fulfilledResults).toHaveLength(promises.length);
  });

  it('should return rejected results', async () => {
    // given
    const error = new TestError();
    const promises = [
      () => simulateThrownSyncOperation(error),
      () => simulateThrownAsyncOperation(error, 100),
    ];

    // when
    const PromiseResults = concurrency(promises).start();

    await vi.runAllTimersAsync();

    const results = await PromiseResults;
    const rejectedResults = getRejectedResults(results);

    // then
    expect(rejectedResults).toEqual([
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error },
    ]);
    expect(rejectedResults).toHaveLength(promises.length);
  });

  it('should return fulfilled and rejected results', async () => {
    // given
    const error = new TestError();
    const promises = [
      () => simulateSyncOperation('foo'),
      () => simulateAsyncOperation('bar', 100),
      () => simulateThrownSyncOperation(error),
      () => simulateThrownAsyncOperation(error, 100),
    ];

    // when
    const PromiseResults = concurrency(promises).start();

    await vi.runAllTimersAsync();

    const results = await PromiseResults;

    // then
    expect(results).toEqual(
      expect.arrayContaining([
        { status: 'fulfilled', value: 'foo' },
        { status: 'fulfilled', value: 'bar' },
        { status: 'rejected', reason: error },
        { status: 'rejected', reason: error },
      ]),
    );
    expect(results).toHaveLength(promises.length);
  });

  it('should execute all promises with no limit specified', async () => {
    // given
    const executionTimePerPromise = 100;
    const totalPromises = 3;
    const expectedExecutionTime = calcExecutionTime({
      totalPromises,
      executionTimePerPromise,
    }); // ~105ms
    const { promises } = generatePromises({
      executionTimePerPromise,
      totalPromises,
    });

    // when
    const startTime = Date.now();

    const PromiseResults = concurrency(promises).start();

    await vi.runAllTimersAsync();

    const results = await PromiseResults;

    const endTime = Date.now();

    // given
    const duration = endTime - startTime;
    const expectedElapsedTimeWithBuffer = expectedExecutionTime + bufferTime;

    // then
    expect(getFulfilledResults(results)).toEqual([
      { status: 'fulfilled', value: '#1 result' },
      { status: 'fulfilled', value: '#2 result' },
      { status: 'fulfilled', value: '#3 result' },
    ]);
    expect(duration).toBeGreaterThanOrEqual(expectedExecutionTime);
    expect(duration).toBeLessThan(expectedElapsedTimeWithBuffer);
  });

  it('should execute promises sequentially when concurrency is limited to 1', async () => {
    // given
    const executionTimePerPromise = 100;
    const totalPromises = 5;
    const concurrencyLimit = 1;
    const expectedExecutionTime = calcExecutionTime({
      totalPromises,
      concurrencyLimit,
      executionTimePerPromise,
    }); // ~505ms
    const { promises } = generatePromises({
      executionTimePerPromise,
      totalPromises,
    });

    // when
    const startTime = Date.now();

    const PromiseResults = concurrency(promises, {
      limit: concurrencyLimit,
    }).start();

    await vi.runAllTimersAsync();

    const results = await PromiseResults;

    const endTime = Date.now();

    // given
    const duration = endTime - startTime;
    const expectedElapsedTimeWithBuffer = expectedExecutionTime + bufferTime;

    // then
    expect(getFulfilledResults(results)).toEqual([
      { status: 'fulfilled', value: '#1 result' },
      { status: 'fulfilled', value: '#2 result' },
      { status: 'fulfilled', value: '#3 result' },
      { status: 'fulfilled', value: '#4 result' },
      { status: 'fulfilled', value: '#5 result' },
    ]);
    expect(duration).toBeGreaterThanOrEqual(expectedExecutionTime);
    expect(duration).toBeLessThan(expectedElapsedTimeWithBuffer);
  });

  it('should limits the number of concurrent executions as specified', async () => {
    // given
    const executionTimePerPromise = 100;
    const totalPromises = 3;
    const { promises, getMaxConcurrentExecutions } = generatePromises({
      executionTimePerPromise,
      totalPromises,
    });

    // when
    const PromiseResults = concurrency(promises, { limit: 2 }).start();

    await vi.runAllTimersAsync();

    await PromiseResults;

    // then
    expect(getMaxConcurrentExecutions()).toBe(2);
  });

  it('should preserves the order of results according to the input promises, not completion order', async () => {
    // given
    const error1 = new Error('error #1');
    const error2 = new Error('error #2');

    const promises = [
      () => simulateAsyncOperation('result1', 400), // finish fourth
      () => simulateAsyncOperation('result2', 100), // finish first
      () => simulateThrownAsyncOperation(error1, 300), // finish third
      () => simulateAsyncOperation('result3', 200), // finish second
      () => simulateThrownAsyncOperation(error2, 500), // finish fifth
    ];

    // when
    const PromiseResults = concurrency(promises).start();

    await vi.runAllTimersAsync();

    const results = await PromiseResults;

    // then
    expect(results).toEqual([
      { status: 'fulfilled', value: 'result1' },
      { status: 'fulfilled', value: 'result2' },
      { status: 'rejected', reason: error1 },
      { status: 'fulfilled', value: 'result3' },
      { status: 'rejected', reason: error2 },
    ]);
  });

  it('should return both synchronous and asynchronous errors correctly', async () => {
    // given
    const error1 = new Error('error #1');
    const error2 = new Error('error #2');
    const promises = [
      () => simulateThrownAsyncOperation(error1, 100), // Asynchronous error
      () => simulateThrownSyncOperation(error2), // Synchronous error
    ];

    // when
    const PromiseResults = concurrency(promises).start();

    await vi.runAllTimersAsync();

    const results = await PromiseResults;

    // then
    expect(results).toEqual([
      { status: 'rejected', reason: error1 },
      { status: 'rejected', reason: error2 },
    ]);
  });

  it('should treat plain returned values as fulfilled results', async () => {
    // given
    const promises = [
      () => simulateSyncOperation('plain'),
      () => simulateAsyncOperation(42, 100),
    ];

    // when
    const PromiseResults = concurrency(promises).start();

    await vi.runAllTimersAsync();

    const results = await PromiseResults;

    // then
    expect(results).toEqual([
      { status: 'fulfilled', value: 'plain' },
      { status: 'fulfilled', value: 42 },
    ]);
  });

  it('should treat a plain two-element array as a fulfilled value', async () => {
    // given
    const tupleLikeValue: [number, undefined] = [1, undefined];
    const promises = [() => tupleLikeValue];

    // when
    const results = await concurrency(promises).start();

    // then
    expect(results).toEqual([{ status: 'fulfilled', value: tupleLikeValue }]);
  });

  it('should unwrap ResultLike values returned by concurrent functions', async () => {
    // given
    const error = new TestError();
    const promises = [
      () => ok('ok-value'),
      () => err(error),
      async () => {
        const value = await simulateAsyncOperation('async-ok-value', 100);

        return ok(value);
      },
    ] as const;

    // when
    const PromiseResults = concurrency(promises).start();

    await vi.runAllTimersAsync();

    const results = await PromiseResults;
    const [okResult, errResult, asyncOkResult] = results;
    const okTypeCheck: Assert<
      IsEqual<typeof okResult, SettledResult<string, never>>
    > = true;
    const errTypeCheck: Assert<
      IsEqual<typeof errResult, SettledResult<never, TestError>>
    > = true;
    const asyncOkTypeCheck: Assert<
      IsEqual<typeof asyncOkResult, SettledResult<string, never>>
    > = true;

    // then
    expect(okTypeCheck).toBe(true);
    expect(errTypeCheck).toBe(true);
    expect(asyncOkTypeCheck).toBe(true);
    expect(okResult).toEqual({ status: 'fulfilled', value: 'ok-value' });
    expect(errResult).toEqual({ status: 'rejected', reason: error });
    expect(asyncOkResult).toEqual({
      status: 'fulfilled',
      value: 'async-ok-value',
    });
  });

  it('should support a mix of ResultLike, plain values, and thrown errors', async () => {
    // given
    const thrownError = new Error('thrown-error');
    const resultError = new Error('result-error');
    const promises = [
      () => ok('ok-value'),
      () => 'plain-value',
      async () => err(resultError),
      () => {
        throw thrownError;
      },
    ] as const;

    // when
    const results = await concurrency(promises).start();

    // then
    expect(results).toEqual([
      { status: 'fulfilled', value: 'ok-value' },
      { status: 'fulfilled', value: 'plain-value' },
      { status: 'rejected', reason: resultError },
      { status: 'rejected', reason: thrownError },
    ]);
  });

  it('should adapt arbitrary result values with resultAdapter', async () => {
    // given
    type ExternalResult =
      | { status: 'success'; value: string }
      | { status: 'failure'; error: TestError };
    const error = new TestError();
    const promises = [
      () =>
        ({ status: 'success', value: 'adapter-ok' }) satisfies ExternalResult,
      () => ({ status: 'failure', error }) satisfies ExternalResult,
    ] as const;

    // when
    const results = await concurrency(promises, {
      limit: 2,
      resultAdapter: (input) => {
        if (input.status === 'success') {
          return ok(input.value);
        }

        return err(input.error);
      },
    }).start();
    const [okResult, errResult] = results;
    const okTypeCheck: Assert<
      IsEqual<typeof okResult, SettledResult<string, TestError>>
    > = true;
    const errTypeCheck: Assert<
      IsEqual<typeof errResult, SettledResult<string, TestError>>
    > = true;

    // then
    expect(okTypeCheck).toBe(true);
    expect(errTypeCheck).toBe(true);
    expect(okResult).toEqual({ status: 'fulfilled', value: 'adapter-ok' });
    expect(errResult).toEqual({ status: 'rejected', reason: error });
  });

  it('should not pass ResultLike values through resultAdapter again', async () => {
    // given
    const adapterError = new TestError();
    const resultAdapter = vi.fn(() => err(adapterError));
    const promises = [() => ok('already-result')];

    // when
    const results = await concurrency(promises, {
      limit: 1,
      resultAdapter,
    }).start();

    // then
    expect(results).toEqual([{ status: 'fulfilled', value: 'already-result' }]);
    expect(resultAdapter).not.toHaveBeenCalled();
  });

  it('should unwrap ok without a value as a fulfilled undefined value', async () => {
    // given
    const promises = [() => ok()] as const;

    // when
    const results = await concurrency(promises).start();
    const [result] = results;
    const typeCheck: Assert<
      IsEqual<typeof result, SettledResult<void, never>>
    > = true;

    // then
    expect(typeCheck).toBe(true);
    expect(result).toEqual({ status: 'fulfilled', value: undefined });
  });

  it('should unwrap err with an undefined reason as a rejected undefined reason', async () => {
    // given
    const promises = [() => err(undefined)] as const;

    // when
    const results = await concurrency(promises).start();
    const [result] = results;
    const typeCheck: Assert<
      IsEqual<typeof result, SettledResult<never, undefined>>
    > = true;

    // then
    expect(typeCheck).toBe(true);
    expect(result).toEqual({ status: 'rejected', reason: undefined });
  });

  it('should reject when resultAdapter throws', async () => {
    // given
    const adapterError = new TestError();
    const promises = [() => 'value'];

    // when
    const results = await concurrency(promises, {
      limit: 1,
      resultAdapter: () => {
        throw adapterError;
      },
    }).start();

    // then
    expect(results).toEqual([{ status: 'rejected', reason: adapterError }]);
  });

  it('should adapt resolved async values with resultAdapter', async () => {
    // given
    type ExternalResult =
      | { status: 'success'; value: string }
      | { status: 'failure'; error: TestError };
    const error = new TestError();
    const promises = [
      () =>
        simulateAsyncOperation(
          {
            status: 'success',
            value: 'async-adapter-ok',
          } satisfies ExternalResult,
          100,
        ),
      () =>
        simulateAsyncOperation(
          { status: 'failure', error } satisfies ExternalResult,
          50,
        ),
    ] as const;

    // when
    const PromiseResults = concurrency(promises, {
      limit: 2,
      resultAdapter: (input) => {
        if (input.status === 'success') {
          return ok(input.value);
        } else if (input.status === 'failure') {
          return err(input.error);
        }

        test.fails('should be success or failure');
        throw new Error('unreachable');
      },
    }).start();

    await vi.runAllTimersAsync();

    const results = await PromiseResults;

    // then
    expect(results).toEqual([
      { status: 'fulfilled', value: 'async-adapter-ok' },
      { status: 'rejected', reason: error },
    ]);
  });

  it('should unwrap promised ResultLike values', async () => {
    // given
    const error = new TestError();
    const promises = [
      () => Promise.resolve(ok('promised-ok')),
      () => simulateAsyncOperation(err(error), 100),
    ] as const;

    // when
    const PromiseResults = concurrency(promises).start();

    await vi.runAllTimersAsync();

    const results = await PromiseResults;
    const [okResult, errResult] = results;
    const okTypeCheck: Assert<
      IsEqual<typeof okResult, SettledResult<string, never>>
    > = true;
    const errTypeCheck: Assert<
      IsEqual<typeof errResult, SettledResult<never, TestError>>
    > = true;

    // then
    expect(okTypeCheck).toBe(true);
    expect(errTypeCheck).toBe(true);
    expect(okResult).toEqual({ status: 'fulfilled', value: 'promised-ok' });
    expect(errResult).toEqual({ status: 'rejected', reason: error });
  });

  it('should execute all promises when limit is explicitly set to Infinity', async () => {
    // given
    const totalPromises = 3;
    const { promises, getMaxConcurrentExecutions } = generatePromises({
      executionTimePerPromise: 100,
      totalPromises,
    });

    // when
    const PromiseResults = concurrency(promises, { limit: Infinity }).start();

    await vi.runAllTimersAsync();

    const results = await PromiseResults;

    // then
    expect(getFulfilledResults(results)).toHaveLength(totalPromises);
    expect(getMaxConcurrentExecutions()).toBe(totalPromises);
  });

  it('should return an empty result list for an empty promise list', async () => {
    // given
    const promises = [] as const;

    // when
    const results = await concurrency(promises).start();

    // then
    expect(results).toEqual([]);
  });

  it('should execute tasks again on each start call', async () => {
    // given
    let calls = 0;
    const runner = concurrency([
      () => {
        calls++;

        return calls;
      },
    ] as const);

    // when
    const firstResults = await runner.start();
    const secondResults = await runner.start();

    // then
    expect(firstResults).toEqual([{ status: 'fulfilled', value: 1 }]);
    expect(secondResults).toEqual([{ status: 'fulfilled', value: 2 }]);
    expect(calls).toBe(2);
  });

  it('should not pass thrown errors through resultAdapter', async () => {
    // given
    const error = new TestError();
    const resultAdapter = vi.fn(() => ok('adapter-value'));
    const promises = [
      () => {
        throw error;
      },
    ];

    // when
    const results = await concurrency(promises, {
      limit: 1,
      resultAdapter,
    }).start();

    // then
    expect(results).toEqual([{ status: 'rejected', reason: error }]);
    expect(resultAdapter).not.toHaveBeenCalled();
  });

  it('should preserve order with a limit and mixed result sources', async () => {
    // given
    const thrownError = new Error('thrown-error');
    const resultError = new Error('result-error');
    const promises = [
      () => simulateAsyncOperation(ok('first'), 300),
      () => simulateAsyncOperation('second', 100),
      () => simulateThrownAsyncOperation(thrownError, 200),
      () => simulateAsyncOperation(err(resultError), 50),
    ] as const;

    // when
    const PromiseResults = concurrency(promises, { limit: 2 }).start();

    await vi.runAllTimersAsync();

    const results = await PromiseResults;

    // then
    expect(results).toEqual([
      { status: 'fulfilled', value: 'first' },
      { status: 'fulfilled', value: 'second' },
      { status: 'rejected', reason: thrownError },
      { status: 'rejected', reason: resultError },
    ]);
  });

  describe('should throw an error', () => {
    test.each([-Infinity, -5, 0, 3.333])(
      'when the limit is set to: %s',
      async (limit) => {
        // given
        const { promises } = generatePromises({
          executionTimePerPromise: 50,
          totalPromises: 2,
        });

        // when
        const results = concurrency(promises, { limit }).start();

        // then
        await expect(results).rejects.toEqual(
          new TypeError(`Expected 'limit' to be a number from 1 and up`),
        );
      },
    );
  });
});

function generatePromises(config: {
  executionTimePerPromise: number;
  totalPromises: number;
}): {
  promises: (() => Promise<string>)[];
  getConcurrentExecutions: () => number;
  getMaxConcurrentExecutions: () => number;
} {
  const { totalPromises, executionTimePerPromise } = config;

  let concurrentExecutions = 0;
  let maxConcurrentExecutions = 0;

  function generatePromise(label: string, executionTime: number) {
    return async () => {
      concurrentExecutions++;
      maxConcurrentExecutions = Math.max(
        maxConcurrentExecutions,
        concurrentExecutions,
      );
      const result = await simulateAsyncOperation(label, executionTime);
      concurrentExecutions--;
      return result;
    };
  }

  const promises = Array.from({ length: totalPromises }).map(
    (_value, index) => {
      return generatePromise(`#${index + 1} result`, executionTimePerPromise);
    },
  );

  return {
    promises,
    getConcurrentExecutions: () => concurrentExecutions,
    getMaxConcurrentExecutions: () => maxConcurrentExecutions,
  };
}

function calcExecutionTime(params: {
  executionTimePerPromise: number;
  totalPromises: number;
  concurrencyLimit?: number;
}) {
  if (params.concurrencyLimit) {
    return (
      (params.totalPromises / params.concurrencyLimit) *
      params.executionTimePerPromise
    );
  } else {
    return (
      (params.totalPromises / params.totalPromises) *
      params.executionTimePerPromise
    );
  }
}
