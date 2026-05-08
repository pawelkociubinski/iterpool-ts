import type {
  AwaitedFulfilledValue,
  AwaitedRejectedReason,
  ConcurrentFunction,
  ConcurrentFunctionSettledResult,
  ExtractConcurrentValue,
  FulfilledResult,
  RejectedResult,
  ResultLike,
  SettledResult,
} from './concurrency.ts';

type SettledResultStatus = SettledResult<unknown, unknown>['status'];

type SettledResultPayload<T> =
  T extends FulfilledResult<infer TValue>
    ? TValue
    : T extends RejectedResult<infer TReason>
      ? TReason
      : never;

// Preserve tuple positions for readonly tuples, but fall back to a regular array
// when callers pass a non-tuple list. This keeps literal calls precise without
// over-promising positional types for dynamic arrays.
type SettledResultPayloadsInOrder<
  T extends readonly SettledResult<unknown, unknown>[],
> =
  number extends T['length']
    ? Array<SettledResultPayload<T[number]>>
    : {
        [K in keyof T]: SettledResultPayload<T[K]>;
      };

// Once every result has the same status, this maps each original concurrent
// function result to only the fulfilled or rejected branch for the same index.
type ConcurrentResultsByStatus<
  TStatus extends SettledResultStatus,
  T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
> = {
  [K in keyof ConcurrentFunctionSettledResult<T, TResult>]: Extract<
    ConcurrentFunctionSettledResult<T, TResult>[K],
    { status: TStatus }
  >;
};

export type ConcurrentFulfilledValuesInOrder<
  T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
> = number extends T['length']
  ? AwaitedFulfilledValue<T, TResult>[]
  : {
      [K in keyof T]: T[K] extends ConcurrentFunction
        ? ExtractConcurrentValue<T[K], TResult>
        : never;
    };

type ConcurrentFulfilledResults<
  T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
> = ConcurrentResultsByStatus<'fulfilled', T, TResult>;

type ConcurrentRejectedResults<
  T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
> = ConcurrentResultsByStatus<'rejected', T, TResult>;

export function isFulfilledResult<TValue, TReason>(
  result: SettledResult<TValue, TReason>,
): result is FulfilledResult<TValue> {
  return result.status === 'fulfilled';
}

export function isRejectedResult<TValue, TReason>(
  result: SettledResult<TValue, TReason>,
): result is RejectedResult<TReason> {
  return result.status === 'rejected';
}

export function getFulfilledResults<
  const T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
>(
  results: ConcurrentFunctionSettledResult<T, TResult>,
): FulfilledResult<AwaitedFulfilledValue<T, TResult>>[];
export function getFulfilledResults<TValue, TReason>(
  results: readonly SettledResult<TValue, TReason>[],
): FulfilledResult<TValue>[];
export function getFulfilledResults(
  results: readonly SettledResult<unknown, unknown>[],
): FulfilledResult<unknown>[] {
  return results.filter(isFulfilledResult);
}

// Use after `areFulfilledResults` narrowed the whole concurrent result tuple;
// at that point all values are fulfilled and their original order is still known.
export function getConcurrentFulfilledValues<
  const T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
>(
  results: ConcurrentFulfilledResults<T, TResult>,
): ConcurrentFulfilledValuesInOrder<T, TResult>;
export function getConcurrentFulfilledValues(
  results: readonly FulfilledResult<unknown>[],
): readonly unknown[] {
  return getFulfilledValues(results);
}

export function getFulfilledValues<
  const T extends readonly FulfilledResult<unknown>[],
>(results: T): SettledResultPayloadsInOrder<T>;
export function getFulfilledValues(
  results: readonly FulfilledResult<unknown>[],
): readonly unknown[] {
  return results.map((result) => result.value);
}

export function getRejectedResults<
  const T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
>(
  results: ConcurrentFunctionSettledResult<T, TResult>,
): RejectedResult<AwaitedRejectedReason<T, TResult>>[];
export function getRejectedResults<TValue, TReason>(
  results: readonly SettledResult<TValue, TReason>[],
): RejectedResult<TReason>[];
export function getRejectedResults(
  results: readonly SettledResult<unknown, unknown>[],
): RejectedResult<unknown>[] {
  return results.filter(isRejectedResult);
}

// Use after `areRejectedResults` narrowed the whole concurrent result tuple;
// at that point all reasons are rejected and share the concurrent error union.
export function getConcurrentRejectedReasons<
  const T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
>(results: ConcurrentRejectedResults<T, TResult>): AwaitedRejectedReason<
  T,
  TResult
>[];
export function getConcurrentRejectedReasons(
  results: readonly RejectedResult<unknown>[],
): readonly unknown[] {
  return getRejectedReasons(results);
}

export function getRejectedReasons<
  const T extends readonly RejectedResult<unknown>[],
>(results: T): SettledResultPayloadsInOrder<T>;
export function getRejectedReasons(
  results: readonly RejectedResult<unknown>[],
): readonly unknown[] {
  return results.map((result) => result.reason);
}

export function areFulfilledResults<
  const T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
>(
  results: ConcurrentFunctionSettledResult<T, TResult>,
): results is ConcurrentFulfilledResults<T, TResult>;
export function areFulfilledResults<TValue, TReason>(
  results: readonly SettledResult<TValue, TReason>[],
): results is readonly FulfilledResult<TValue>[];
export function areFulfilledResults(
  results: readonly SettledResult<unknown, unknown>[],
): results is readonly FulfilledResult<unknown>[] {
  return results.every(isFulfilledResult);
}

export function areRejectedResults<
  const T extends readonly ConcurrentFunction[],
  TResult extends ResultLike<unknown, unknown> | undefined = undefined,
>(
  results: ConcurrentFunctionSettledResult<T, TResult>,
): results is ConcurrentRejectedResults<T, TResult>;
export function areRejectedResults<TValue, TReason>(
  results: readonly SettledResult<TValue, TReason>[],
): results is readonly RejectedResult<TReason>[];
export function areRejectedResults(
  results: readonly SettledResult<unknown, unknown>[],
): results is readonly RejectedResult<unknown>[] {
  return results.every(isRejectedResult);
}
