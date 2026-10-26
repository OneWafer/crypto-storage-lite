/*
 * @Author: OneWafer
 * @Description: Error types for crypto-storage-lite
 */

/**
 * Machine-readable error codes
 */
export type StorageErrorCode =
	/** The current environment does not expose `crypto.getRandomValues` */
	| 'CRYPTO_UNAVAILABLE'
	/** Decryption or integrity verification failed (tampered, foreign or wrong key) */
	| 'DECRYPT_FAILED'
	/** The value could not be serialized to JSON */
	| 'SERIALIZE_FAILED'
	/** The stored string is not in a format this library understands */
	| 'PARSE_FAILED'
	/** The storage quota was exceeded */
	| 'QUOTA_EXCEEDED'
	/** The storage area exists but the environment refuses access to it */
	| 'STORAGE_UNAVAILABLE'
	/** Reading from the storage area failed */
	| 'READ_FAILED'
	/** Writing to the storage area failed for another reason */
	| 'WRITE_FAILED'

/**
 * Error thrown by every failure path in this library.
 * Carries a stable `code` so callers can branch without string matching,
 * and preserves `cause` for debugging.
 */
export class StorageError extends Error {
	readonly code: StorageErrorCode

	constructor(message: string, code: StorageErrorCode, options?: { cause?: unknown }) {
		super(message)
		this.name = 'StorageError'
		this.code = code
		if (options?.cause !== undefined) {
			this.cause = options.cause
		}
	}
}

/**
 * Read `error.name` without relying on `instanceof` or the prototype chain: an
 * error thrown by another realm (an iframe, a worker) is not an `instanceof
 * Error` here, but it still has a usable `name`.
 */
const errorName = (error: unknown): string | null => {
	if (typeof error !== 'object' || error === null) return null
	const name = (error as { name?: unknown }).name
	return typeof name === 'string' ? name : null
}

/**
 * Brand check for `StorageError`.
 *
 * `instanceof` breaks when two copies of this library are loaded (duplicate
 * dependencies, an iframe, a page with several bundles), so the check also
 * accepts anything that carries the same `name` and a string `code`.
 */
export const isStorageError = (error: unknown): error is StorageError =>
	error instanceof StorageError ||
	(errorName(error) === 'StorageError' && typeof (error as { code?: unknown }).code === 'string')

/**
 * Detect a quota failure across browsers (Safari/Firefox use a different name,
 * and older engines only expose the numeric `code`).
 */
export const isQuotaError = (error: unknown): boolean => {
	const name = errorName(error)
	if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return true
	const legacyCode = (error as { code?: unknown } | null)?.code
	return legacyCode === 22 || legacyCode === 1014
}

/**
 * Detect an environment that refuses storage access outright: Safari private
 * mode, a sandboxed iframe, or a browser configured to block site data.
 */
export const isBlockedError = (error: unknown): boolean => {
	const name = errorName(error)
	return name === 'SecurityError' || name === 'InvalidAccessError' || name === 'InvalidStateError'
}
