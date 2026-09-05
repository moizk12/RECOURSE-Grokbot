/**
 * Generic fail-closed result type. There is no "throw and hope someone catches it"
 * path anywhere in the validation pipeline — every function that can fail returns
 * one of these instead.
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; errors: E[] };

export function ok<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

export function fail<T, E>(errors: E[]): Result<T, E> {
  return { ok: false, errors };
}
