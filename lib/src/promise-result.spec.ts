import { FulfilledResult, RejectedResult } from './concurrency.js';
import {
  areFulfilledResults,
  areRejectedResults,
  getFulfilledResults,
  getFulfilledValues,
  getRejectedReasons,
  getRejectedResults,
  isFulfilledResult,
  isRejectedResult,
} from './promise-result.js';

type Assert<T extends true> = T;
type IsEqual<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends <T>() => T extends TRight ? 1 : 2
    ? true
    : false;

describe('Promise result type guards', () => {
  const error = new Error();
  const fulfilledResult = {
    status: 'fulfilled',
    value: 'Success',
  } satisfies FulfilledResult<string>;
  const rejectedResult = {
    status: 'rejected',
    reason: error,
  } satisfies RejectedResult<Error>;

  describe('getFulfilledResults', () => {
    test('should return only fulfilled results', () => {
      // given
      const settledResult = [fulfilledResult, rejectedResult];

      // when
      const fulfilledResults = getFulfilledResults(settledResult);

      // then
      expect(fulfilledResults).toEqual([fulfilledResult]);
      expect(fulfilledResults.length).toEqual(1);
    });

    test('should return only fulfulled void results', () => {
      // given
      const voidResult = {
        status: 'fulfilled',
        value: undefined,
      } satisfies PromiseSettledResult<undefined>;
      const settledResult = [fulfilledResult, voidResult];

      // when
      const fulfilledResults = getFulfilledResults(settledResult);

      // then
      expect(fulfilledResults).toEqual([fulfilledResult, voidResult]);
      expect(fulfilledResults.length).toEqual(2);
    });
  });

  describe('getRejectedReasons', () => {
    test('should return only fulfilled results', () => {
      // given
      const settledResult = [fulfilledResult, rejectedResult];

      // when
      const rejectedResults = getRejectedResults(settledResult);

      // then
      expect(rejectedResults).toEqual([rejectedResult]);
      expect(rejectedResults.length).toEqual(1);
    });
  });

  describe('getFulfilledValues', () => {
    test('should infer values in tuple order', () => {
      // given
      const values = getFulfilledValues([
        { status: 'fulfilled', value: 123 } as const,
        { status: 'fulfilled', value: 'abc' } as const,
      ]);

      // then
      const typeCheck: Assert<IsEqual<typeof values, readonly [123, 'abc']>> =
        true;
      expect(typeCheck).toBe(true);
      expect(values).toEqual([123, 'abc']);
    });
  });

  describe('getRejectedReasons helper', () => {
    test('should infer reasons in tuple order', () => {
      // given
      const errorOne = new Error('one');
      const errorTwo = new TypeError('two');
      const reasons = getRejectedReasons([
        { status: 'rejected', reason: errorOne } as const,
        { status: 'rejected', reason: errorTwo } as const,
      ]);

      // then
      const typeCheck: Assert<
        IsEqual<typeof reasons, readonly [Error, TypeError]>
      > = true;
      expect(typeCheck).toBe(true);
      expect(reasons).toEqual([errorOne, errorTwo]);
    });
  });

  describe('isRejectedResult', () => {
    test('should identify rejected results', () => {
      expect(isRejectedResult(rejectedResult)).toBeTruthy();
    });
  });

  describe('isFulfilledResult', () => {
    test('should identify fulfilled results', () => {
      // when
      const result = isFulfilledResult(fulfilledResult);

      // then
      expect(result).toBeTruthy();
    });
  });

  describe('result list helpers', () => {
    test('should return true for fully fulfilled results', () => {
      const settledResult = [
        fulfilledResult,
        { status: 'fulfilled', value: 123 } as const,
      ];

      expect(areFulfilledResults(settledResult)).toBe(true);
      expect(areRejectedResults(settledResult)).toBe(false);
    });

    test('should return true for fully rejected results', () => {
      const settledResult = [
        rejectedResult,
        {
          status: 'rejected',
          reason: new Error('error #2'),
        } satisfies RejectedResult<Error>,
      ];

      expect(areRejectedResults(settledResult)).toBe(true);
      expect(areFulfilledResults(settledResult)).toBe(false);
    });
  });
});
