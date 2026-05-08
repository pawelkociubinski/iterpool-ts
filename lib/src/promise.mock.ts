export function simulateThrownSyncOperation(reason: unknown): never {
  throw reason;
}

export async function simulateThrownAsyncOperation(
  reason: unknown,
  delay: number,
): Promise<never> {
  try {
    await new Promise<never>((_resolve, reject) => {
      setTimeout(() => {
        reject();
      }, delay);
    });

    test.fails('should fail'); // This line is unreachable, but it's needed to make TypeScript happy

    throw new Error('unreachable');

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_error) {
    throw reason;
  }
}

export function simulateSyncOperation<T>(result: T): T {
  return result;
}

export async function simulateAsyncOperation<T>(
  result: T,
  delay: number,
): Promise<T> {
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, delay);
  });

  return result;
}
