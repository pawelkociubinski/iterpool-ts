import { AggregateError } from './aggregate-error.js';
import type {
  AwaitedFulfilledValue,
  AwaitedRejectedReason,
  ConcurrentFunction,
  ConcurrentFunctionSettledResult,
  ResultAdapter,
  ResultLike,
} from './concurrency.js';
import { concurrency } from './concurrency.js';
import {
  areFulfilledResults,
  areRejectedResults,
  type ConcurrentFulfilledValuesInOrder,
  getConcurrentFulfilledValues,
  getConcurrentRejectedReasons,
  getFulfilledResults,
  getFulfilledValues,
  getRejectedReasons,
  getRejectedResults,
} from './promise-result.js';

type OkResult<
  T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
> = {
  status: 'success';
  value: ConcurrentFulfilledValuesInOrder<T, TResult>;
  error: undefined;
};

type ErrorResult<
  T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
> = {
  error: AggregateError<AwaitedRejectedReason<T, TResult>>;
  status: 'error';
  value: undefined;
};

type PartialResult<
  T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
> = {
  error: AggregateError<AwaitedRejectedReason<T, TResult>>;
  status: 'partial-success';
  value: AwaitedFulfilledValue<T, TResult>[];
};

// The public result is a discriminated union. Consumers can branch on `status`
// and TypeScript narrows `value` and `error` to the corresponding shape.
export type RunConcurrentPromisesResult<
  T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
> = OkResult<T, TResult> | ErrorResult<T, TResult> | PartialResult<T, TResult>;

// When `TResult` is supplied, the caller is asking to adapt raw task outputs
// into ok/err results, so `resultAdapter` must be present. Without `TResult`,
// the adapter is intentionally disallowed to keep inference on the default path.
export type RunConcurrentPromisesParams<
  T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
> = {
  promises: readonly [...T];
  limit?: number;
} & ([TResult] extends [ResultLike<unknown, unknown>]
  ? { resultAdapter: ResultAdapter<T, TResult> }
  : { resultAdapter?: undefined });

export async function runConcurrentPromises<
  const T extends readonly ConcurrentFunction[],
>(
  params: RunConcurrentPromisesParams<T>,
): Promise<RunConcurrentPromisesResult<T>>;
export async function runConcurrentPromises<
  const T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown>,
>(
  params: RunConcurrentPromisesParams<T, TResult>,
): Promise<RunConcurrentPromisesResult<T, TResult>>;
export async function runConcurrentPromises<
  const T extends readonly ConcurrentFunction[],
>(
  params:
    | RunConcurrentPromisesParams<T>
    | RunConcurrentPromisesParams<T, ResultLike<unknown, unknown>>,
): Promise<
  | RunConcurrentPromisesResult<T>
  | RunConcurrentPromisesResult<T, ResultLike<unknown, unknown>>
> {
  const { limit = Infinity, promises, resultAdapter } = params;

  if (resultAdapter) {
    const results = await concurrency(promises, {
      limit,
      resultAdapter,
    }).start();

    return toRunConcurrentPromisesResult(results);
  }

  const results = await concurrency(promises, { limit }).start();

  return toRunConcurrentPromisesResult(results);
}

// Convert the lower-level settled tuple into the higher-level API result:
// all fulfilled keeps tuple order, all rejected becomes one AggregateError,
// and the mixed case returns fulfilled values plus aggregated rejection reasons.
function toRunConcurrentPromisesResult<
  const T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
>(
  results: ConcurrentFunctionSettledResult<T, TResult>,
): RunConcurrentPromisesResult<T, TResult> {
  if (areFulfilledResults(results)) {
    return {
      status: 'success',
      value: getConcurrentFulfilledValues(results),
      error: undefined,
    };
  }

  if (areRejectedResults(results)) {
    return {
      error: new AggregateError(getConcurrentRejectedReasons(results)),
      status: 'error',
      value: undefined,
    };
  }

  const fulfilledResults = getFulfilledResults(results);
  const rejectedResults = getRejectedResults(results);

  return {
    status: 'partial-success',
    value: getFulfilledValues(fulfilledResults),
    error: new AggregateError(getRejectedReasons(rejectedResults)),
  };
}
