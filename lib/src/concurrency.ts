const RESULT_TYPE = Symbol('result-type');

// `ok` and `err` return branded tuples. The private symbol lets runtime code
// distinguish them from ordinary two-element arrays returned by user functions.
type OkResult<TValue = void> = [value: TValue, error: undefined] & {
  [RESULT_TYPE]: 'ok';
};
type ErrorResult<TError = Error> = [value: undefined, error: TError] & {
  [RESULT_TYPE]: 'error';
};
export type ResultLike<TValue, TError = Error> =
  | OkResult<TValue>
  | ErrorResult<TError>;

export function ok(): OkResult;
export function ok<TValue>(value: TValue): OkResult<TValue>;
export function ok<TValue>(value?: TValue): OkResult<TValue> {
  const okResult = [value, undefined] as OkResult<TValue>;

  Object.defineProperty(okResult, RESULT_TYPE, {
    value: 'ok',
    enumerable: false,
  });

  return okResult;
}

export function err<TError>(error: TError): ErrorResult<TError> {
  const errResult = [undefined, error] as ErrorResult<TError>;

  Object.defineProperty(errResult, RESULT_TYPE, {
    value: 'error',
    enumerable: false,
  });

  return errResult;
}

function isResultLike<TValue = unknown, TError = Error>(
  value: unknown,
): value is ResultLike<TValue, TError> {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    RESULT_TYPE in value &&
    (value[RESULT_TYPE] === 'ok' || value[RESULT_TYPE] === 'error')
  );
}

function toSettledResult<TValue, TError>(
  result: ResultLike<TValue, TError>,
): SettledResult<TValue, TError> {
  if (result[RESULT_TYPE] === 'ok') {
    return {
      status: 'fulfilled',
      value: result[0],
    };
  }

  return {
    status: 'rejected',
    reason: result[1],
  };
}

export type FulfilledResult<TValue> = {
  status: 'fulfilled';
  value: TValue;
};
export type RejectedResult<TError> = {
  status: 'rejected';
  reason: TError;
};
export type SettledResult<V, E> = FulfilledResult<V> | RejectedResult<E>;

export type ConcurrentFunction<TValue = unknown> = () =>
  | TValue
  | Promise<TValue>;

// For a tuple of concurrent functions, `T[number]` is the union of all task
// functions. `ReturnType` and `Awaited` turn that into every possible raw output
// that a result adapter can receive.
export type ResultAdapterInput<T extends readonly ConcurrentFunction[]> =
  Awaited<ReturnType<T[number]>>;

// The adapter normalizes arbitrary task output into the same branded ok/err
// shape that tasks may also return directly.
export type ResultAdapter<
  T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown>,
> = (input: ResultAdapterInput<T>) => TResult;

// These conditional types distribute over ResultLike unions. For example,
// `OkResult<string> | ErrorResult<FooError>` becomes `string` for values and
// `FooError` for errors.
type ExtractResultValue<TResult extends ResultLike<unknown, unknown>> =
  TResult extends OkResult<infer TValue> ? TValue : never;
type ExtractResultError<TResult extends ResultLike<unknown, unknown>> =
  TResult extends ErrorResult<infer TError> ? TError : never;

type AwaitedConcurrentFunctionResult<F extends ConcurrentFunction> = Awaited<
  ReturnType<F>
>;

// This mirrors the runtime precedence in `settleResult`:
// 1. a task-returned ResultLike is settled directly;
// 2. otherwise an adapter result is used when present;
// 3. otherwise the raw task output is the fulfilled value and errors are unknown.
type ExtractSettledValue<
  TOutput,
  TAdapterResult extends ResultLike<unknown, unknown> | undefined,
> =
  TOutput extends ResultLike<unknown, unknown>
    ? ExtractResultValue<TOutput>
    : TAdapterResult extends ResultLike<unknown, unknown>
      ? ExtractResultValue<TAdapterResult>
      : TOutput;

type ExtractSettledError<
  TOutput,
  TAdapterResult extends ResultLike<unknown, unknown> | undefined,
> =
  TOutput extends ResultLike<unknown, unknown>
    ? ExtractResultError<TOutput>
    : TAdapterResult extends ResultLike<unknown, unknown>
      ? ExtractResultError<TAdapterResult>
      : unknown;

export type ExtractConcurrentValue<
  F extends ConcurrentFunction,
  TAdapterResult extends ResultLike<unknown, unknown> | undefined = undefined,
> = ExtractSettledValue<AwaitedConcurrentFunctionResult<F>, TAdapterResult>;

export type ExtractConcurrentError<
  F extends ConcurrentFunction,
  TAdapterResult extends ResultLike<unknown, unknown> | undefined = undefined,
> = ExtractSettledError<AwaitedConcurrentFunctionResult<F>, TAdapterResult>;

export type AwaitedFulfilledValue<
  T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
> = ExtractConcurrentValue<T[number], TResult>;
export type AwaitedRejectedReason<
  T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
> = ExtractConcurrentError<T[number], TResult>;

export type ConcurrentFunctionSettledResult<
  T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
> = {
  // Mapping over `keyof T` preserves tuple positions. Using `T[number]` here
  // would collapse the tasks into one union and lose per-index result types.
  //
  // `-readonly` strips the readonly modifier propagated from `readonly [...T]`,
  // so callers still get a precise tuple while the internal accumulator can be
  // written by index.
  -readonly [K in keyof T]: T[K] extends ConcurrentFunction
    ? SettledResult<
        ExtractConcurrentValue<T[K], TResult>,
        ExtractConcurrentError<T[K], TResult>
      >
    : never;
};

function hasAllSettledResults<TValue, TError>(
  results: readonly (SettledResult<TValue, TError> | undefined)[],
  expectedLength: number,
): results is SettledResult<TValue, TError>[] {
  if (results.length !== expectedLength) {
    return false;
  }

  return results.every((result) => result !== undefined);
}

type RuntimeResultAdapter = (
  input: unknown,
) => ResultLike<unknown, unknown>;

function settleResult(
  result: unknown,
  resultAdapter: RuntimeResultAdapter | undefined,
): SettledResult<unknown, unknown> {
  if (isResultLike(result)) {
    return toSettledResult(result);
  }

  if (resultAdapter) {
    return toSettledResult(resultAdapter(result));
  }

  return {
    status: 'fulfilled',
    value: result,
  };
}

// The public overloads carry the precise tuple and adapter typing. The concrete
// implementation stays intentionally broad because runtime values are not typed
// after the TypeScript layer is erased.
export function concurrency<const T extends readonly ConcurrentFunction[]>(
  /*
   * readonly [...T] to support tuple types and regular arrays
   */
  promises: readonly [...T],
  config?: {
    limit: number;
    resultAdapter?: undefined;
  },
): {
  start: () => Promise<ConcurrentFunctionSettledResult<T>>;
};
export function concurrency<
  const T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown>,
>(
  /*
   * readonly [...T] to support tuple types and regular arrays
   */
  promises: readonly [...T],
  config: {
    limit: number;
    resultAdapter: ResultAdapter<T, TResult>;
  },
): {
  start: () => Promise<ConcurrentFunctionSettledResult<T, TResult>>;
};

export function concurrency(
  promises: readonly ConcurrentFunction[],
  config?: {
    limit: number;
    resultAdapter?: RuntimeResultAdapter;
  },
): {
  start: () => Promise<SettledResult<unknown, unknown>[]>;
} {
  return {
    start: async (): Promise<SettledResult<unknown, unknown>[]> => {
      const limit = config === undefined ? Infinity : config.limit;
      const resultAdapter =
        config === undefined ? undefined : config.resultAdapter;

      if (
        !(
          (Number.isInteger(limit) || limit === Number.POSITIVE_INFINITY) &&
          limit > 0
        )
      ) {
        throw new TypeError(`Expected 'limit' to be a number from 1 and up`);
      }

      const results = Array.from(
        { length: promises.length },
        (): SettledResult<unknown, unknown> | undefined => undefined,
      );
      const iterablePromises = promises.entries();

      const worker = async (): Promise<void> => {
        for (const [index, promise] of iterablePromises) {
          try {
            const result = await promise();
            results[index] = settleResult(result, resultAdapter);
          } catch (cause) {
            results[index] = {
              status: 'rejected',
              reason: cause,
            };
          }
        }
      };

      const pool = Math.min(promises.length, limit);
      const promisePool = Array.from({ length: pool }, worker);
      await Promise.all(promisePool);

      if (!hasAllSettledResults(results, promises.length)) {
        throw new Error('Expected settled result for each concurrent function');
      }

      return results;
    },
  };
}
