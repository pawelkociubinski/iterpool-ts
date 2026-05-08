import { AggregateError } from './aggregate-error.js';

const fooError = new Error('foo');
const barError = new Error('bar');

describe('AggregateError', () => {
  test('should create an instance', () => {
    // given
    const errors = [fooError, barError];

    // when
    const aggregateError = new AggregateError(errors);

    // then
    expect(aggregateError).toBeInstanceOf(AggregateError);
    expect(aggregateError.errors).toEqual(errors);
    expect(aggregateError).toMatchObject({
      name: 'AggregateError',
      message: 'Multiple errors occurred',
      errors: errors,
    });
  });

  test('should use a custom message', () => {
    // given
    const errors = [fooError, barError];
    const message = 'Custom aggregate error';

    // when
    const aggregateError = new AggregateError(errors, message);

    // then
    expect(aggregateError.message).toBe(message);
  });

  test('should keep a snapshot of input errors', () => {
    // given
    const errors = [fooError, barError];
    const aggregateError = new AggregateError(errors);

    // when
    errors.push(new Error('baz'));

    // then
    expect(aggregateError.errors).toEqual([fooError, barError]);
  });

  describe('withStackTrace', () => {
    test('should return an instance with stack trace', () => {
      // given
      const errors = [fooError, barError];

      // when
      const result = new AggregateError(errors);

      // then
      expect(result).toBeInstanceOf(AggregateError);
      expect(result.stack).toBeDefined();
    });

    test('should have a stack trace for each error', () => {
      // given
      const errors = [fooError, barError];

      // when
      const result = new AggregateError(errors);

      // then
      result.errors.forEach((error) => {
        expect(error.stack).toBeDefined();
      });
    });
  });
});
