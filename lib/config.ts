/*
 * @Author: OneWafer
 * @Description: Global configuration for crypto-storage-lite
 */
import type { StorageError } from './error.js'

/**
 * How read failures (corrupted data) are surfaced.
 * - `throw`  (default) — surface a `StorageError`. Failures are bugs and must not hide.
 * - `ignore` — warn through `console.warn` and resolve to `null` / `false`.
 *
 * A handler function receives every `StorageError` raised on a read path and
 * makes it a non-fatal miss, which is the hook for logging or telemetry.
 */
export type ErrorMode = 'throw' | 'ignore'
export type ErrorHandler = (error: StorageError) => void
export type OnError = ErrorMode | ErrorHandler

export interface StorageConfig {
	/** How read failures are surfaced. Defaults to `'throw'`. */
	onError?: OnError
	/**
	 * Encrypt every write unless the call passes `{ encrypt: false }`.
	 * Defaults to `false`.
	 */
	encryptByDefault?: boolean
	/**
	 * 32-byte AES-256 key. Defaults to the built-in key, which is public in the
	 * bundle and only useful as obfuscation — see the README before relying on it.
	 */
	key?: Uint8Array
}

export interface ResolvedConfig {
	readonly onError: OnError
	readonly encryptByDefault: boolean
	readonly key: Uint8Array | null
}

const KEY_BYTES = 32
const typedArrayName = Object.getOwnPropertyDescriptor(
	Object.getPrototypeOf(Uint8Array.prototype),
	Symbol.toStringTag
)?.get

const DEFAULT_CONFIG: ResolvedConfig = Object.freeze({
	onError: 'throw',
	encryptByDefault: false,
	key: null
})

let config: ResolvedConfig = DEFAULT_CONFIG

/**
 * Configure the library. Encryption works with the built-in key, so this is
 * only needed to change the error policy, encrypt by default, or inject a key.
 *
 * ```ts
 * configureStorage({ onError: 'ignore', encryptByDefault: true })
 * ```
 *
 * Invalid values throw `TypeError` immediately rather than surfacing later as
 * a confusing runtime failure.
 */
export const configureStorage = (next: StorageConfig): void => {
	if (typeof next !== 'object' || next === null) throw new TypeError('Storage configuration must be an object.')
	const { onError, encryptByDefault, key } = next

	if (onError !== undefined && onError !== 'throw' && onError !== 'ignore' && typeof onError !== 'function') {
		throw new TypeError('`onError` must be "throw", "ignore" or a handler function.')
	}
	if (encryptByDefault !== undefined && typeof encryptByDefault !== 'boolean') {
		throw new TypeError('`encryptByDefault` must be a boolean.')
	}
	if (
		key !== undefined &&
		(!ArrayBuffer.isView(key) || typedArrayName?.call(key) !== 'Uint8Array' || key.length !== KEY_BYTES)
	) {
		throw new TypeError(`\`key\` must be a ${KEY_BYTES}-byte Uint8Array (AES-256).`)
	}

	config = Object.freeze({
		onError: onError ?? config.onError,
		encryptByDefault: encryptByDefault ?? config.encryptByDefault,
		// Copy so later mutations of the caller's buffer cannot change the key.
		key: key !== undefined ? new Uint8Array(key) : config.key
	})
}

export const getConfig = (): ResolvedConfig =>
	config.key === null ? config : Object.freeze({ ...config, key: new Uint8Array(config.key) })

/**
 * Restore every option to its default (the built-in key, `onError: 'throw'`,
 * no default encryption). Mainly for tests and hot-reload setups.
 */
export const resetConfig = (): void => {
	config = DEFAULT_CONFIG
}
