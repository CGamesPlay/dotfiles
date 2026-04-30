import { createHash } from "crypto";
import type { PromiseDeferred } from "./types.js";

export function defer<T>(): PromiseDeferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function shortHash(value: string): string {
  return createHash("md5").update(value).digest("hex").slice(0, 12);
}

export function parsePartialJson(
  input: string,
  fallback: Record<string, unknown>,
): Record<string, unknown> {
  if (!input) return fallback;
  try {
    return JSON.parse(input);
  } catch {
    return fallback;
  }
}

/**
 * Bounded async queue feeding `query()`'s prompt input. Producers `push`,
 * consumers async-iterate. Closing terminates iteration after the buffer
 * drains.
 */
export class AsyncMessageQueue<T> {
  private buf: T[] = [];
  private waiters: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(item: T): void {
    if (this.closed) {
      throw new Error("AsyncMessageQueue: cannot push to a closed queue");
    }
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value: item, done: false });
    } else {
      this.buf.push(item);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    while (this.waiters.length) {
      const waiter = this.waiters.shift()!;
      waiter({ value: undefined as unknown as T, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.buf.length) {
          return Promise.resolve({ value: this.buf.shift()!, done: false });
        }
        if (this.closed) {
          return Promise.resolve({
            value: undefined as unknown as T,
            done: true,
          });
        }
        return new Promise<IteratorResult<T>>((resolve) =>
          this.waiters.push(resolve),
        );
      },
    };
  }
}
