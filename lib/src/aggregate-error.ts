export class AggregateError<T> extends Error {
  override name = 'AggregateError';
  readonly errors: readonly T[];

  constructor(errors: readonly T[], message = 'Multiple errors occurred') {
    super(message);
    this.errors = [...errors];
  }
}
