/*
 * @Author: OneWafer
 * @Description: Storage factory shared by the localStorage and sessionStorage drivers
 */
import { getConfig } from './config.js'
import { decrypt, encrypt } from './crypto.js'
import { isBlockedError, isQuotaError, isStorageError, StorageError } from './error.js'

/**
 * Format tag written in front of every value: `cs<version><p|e>:`.
 *
 * It marks values this library owns (so `clear()` never touches anyone else's
 * data). The version digit is there for the first incompatible change: bump
 * `cs1` → `cs2` and values written by the older release are ignored instead of
 * being misread as the new shape.
 */
const PLAIN_PREFIX = 'cs1p:'
const ENCRYPTED_PREFIX = 'cs1e:'

const PROBE_SUFFIX = '__crypto-storage-lite_probe__'

export interface SetOptions {
	/** Encrypt the value with AES-GCM. */
	encrypt?: boolean
}

export interface StorageDriver {
	/**
	 * Read a value. Returns `null` when the key is missing, when the key was not
	 * written by this library, or when the value fails `validate`.
	 */
	get<T = unknown>(key: string, validate?: (value: unknown) => value is T): T | null
	/** Write a value. Encrypted when `options.encrypt` or the driver default says so. */
	set(key: string, value: unknown, options?: SetOptions): void
	/** Whether a value written by this library exists under the key. */
	has(key: string): boolean
	/** Delete a key written by this library. Foreign keys are left alone. */
	remove(key: string): void
	/** Delete every key written by this library. Other keys are left alone. */
	clear(): void
	/** Delete every key in the storage area, including other libraries' keys. */
	clearAll(): void
	/** Names of the keys written by this library. */
	keys(): string[]
	/** False when the runtime provides no usable storage and an in-memory fallback is in use. */
	readonly isPersistent: boolean
}

export interface CreateStorageOptions {
	/**
	 * Identity mixed into the AES-GCM additional data. A payload written by one
	 * driver cannot be decrypted by another, even under the same key name.
	 */
	id?: string
	/**
	 * Namespace prepended to every key in the underlying storage. When set,
	 * `keys()` / `clear()` / `remove()` select keys by this prefix instead of
	 * reading every value in the storage area.
	 */
	prefix?: string
	/** Encrypt every write by default for this driver. Overrides the global setting. */
	encrypt?: boolean
}

/** Minimal in-memory `Storage` stand-in, used when no storage area is usable (SSR, blocked storage). */
const createMemoryArea = (): Storage => {
	const map = new Map<string, string>()
	// `key(index)` is called once per entry by `keys()` / `clear()`; without a
	// cache each call would rebuild the whole key list.
	let snapshot: string[] | null = null
	const order = (): string[] => {
		snapshot ??= [...map.keys()]
		return snapshot
	}
	const mutate = (): void => {
		snapshot = null
	}
	return {
		get length() {
			return map.size
		},
		key: (index: number) => order()[index] ?? null,
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => {
			map.set(key, value)
			mutate()
		},
		removeItem: (key: string) => {
			map.delete(key)
			mutate()
		},
		clear: () => {
			map.clear()
			mutate()
		}
	}
}

const describeKey = (key: string): string => `"${key}"`

/** Internal marker thrown by the replacer, which has no key name to report. */
class OpaqueValueError extends Error {}

/**
 * JSON replacer that rejects values JSON would otherwise drop on the floor
 * (`{ fn: () => 1 }` serializes to `{}`, a bare function to `undefined`), which
 * would otherwise surface as a silent loss on write.
 */
const rejectOpaqueValues = (_key: string, value: unknown): unknown => {
	if (typeof value === 'function' || typeof value === 'symbol') {
		throw new OpaqueValueError(typeof value)
	}
	return value
}

/**
 * Serialize a value. `undefined` is rejected up front instead of being written
 * as nothing and reading back as a missing key.
 */
const serializeValue = (key: string, value: unknown): string => {
	if (value === undefined) {
		throw new StorageError(
			`Cannot store ${describeKey(key)}: the value is undefined. Use \`remove()\` to delete a key.`,
			'SERIALIZE_FAILED'
		)
	}

	try {
		return JSON.stringify(value, rejectOpaqueValues)
	} catch (error) {
		if (error instanceof OpaqueValueError) {
			throw new StorageError(
				`Cannot store ${describeKey(key)}: the value contains a ${error.message}, which JSON cannot represent.`,
				'SERIALIZE_FAILED',
				{ cause: error }
			)
		}
		throw new StorageError(
			`Cannot serialize the value of ${describeKey(key)}: it contains a circular reference or a BigInt.`,
			'SERIALIZE_FAILED',
			{ cause: error }
		)
	}
}

const parseValue = (key: string, json: string): unknown => {
	try {
		return JSON.parse(json)
	} catch (error) {
		throw new StorageError(`Stored value of ${describeKey(key)} is not valid JSON.`, 'PARSE_FAILED', {
			cause: error
		})
	}
}

/**
 * Resolve a Web Storage area lazily.
 *
 * The accessor is called lazily: reading `localStorage` at module scope throws
 * in Safari private mode and in non-browser environments.
 */
export const resolveWebStorage =
	(name: 'localStorage' | 'sessionStorage'): (() => Storage | null) =>
	() => {
		try {
			return globalThis[name] ?? null
		} catch {
			return null
		}
	}

/**
 * Build a driver on top of a storage area accessor.
 *
 * @param resolveArea Returns the storage area, or `null` when the environment
 *   has none (SSR). Called lazily and may throw.
 */
export const createStorage = (resolveArea: () => Storage | null, options: CreateStorageOptions = {}): StorageDriver => {
	const id = options.id ?? 'default'
	const prefix = options.prefix ?? ''
	const memoryArea = createMemoryArea()

	/** `null` until the first probe; then whether the resolved area actually accepts writes. */
	let persistent: boolean | null = null

	/**
	 * A storage area can exist and still reject writes (Safari private mode,
	 * sandboxed iframes). One probe write at first use tells us whether real
	 * persistence works, so `isPersistent` is truthful and a dead area is not
	 * silently filled with data that will vanish.
	 *
	 * A full quota is *not* a reason to abandon the real area: reads still work,
	 * and falling back to memory would hide everything already stored there. The
	 * user then gets an honest `QUOTA_EXCEEDED` on write instead.
	 */
	const probeWritable = (store: Storage): boolean => {
		const name = `${prefix}${PROBE_SUFFIX}`
		try {
			store.setItem(name, '1')
			const accepted = store.getItem(name) === '1'
			store.removeItem(name)
			return accepted
		} catch (error) {
			return isQuotaError(error)
		}
	}

	const area = (): Storage => {
		if (persistent === null) {
			let resolved: Storage | null = null
			try {
				resolved = resolveArea()
			} catch {
				resolved = null
			}
			persistent = resolved !== null && probeWritable(resolved)
		}
		if (!persistent) return memoryArea

		try {
			const resolved = resolveArea()
			if (resolved !== null) return resolved
		} catch {
			// Access was revoked after the probe (permissions changed, context lost).
		}
		persistent = false
		return memoryArea
	}

	/**
	 * Run a storage operation, applying the configured `onError` policy to
	 * library errors on read paths.
	 */
	const read = <T>(operation: () => T): T | null => {
		try {
			return operation()
		} catch (error) {
			const { onError } = getConfig()
			if (onError === 'throw' || !isStorageError(error)) throw error

			if (typeof onError === 'function') onError(error)
			else console.warn(`[crypto-storage-lite] ${error.message}`)
			return null
		}
	}

	const getItem = (key: string): string | null => {
		try {
			return area().getItem(key)
		} catch (error) {
			// Access was refused, not just a bad value: stop trusting the real area.
			// Any other failure is left alone so a transient error does not
			// permanently downgrade the driver to memory.
			if (isBlockedError(error)) persistent = false
			throw new StorageError(`Cannot read ${describeKey(key)} from storage.`, 'READ_FAILED', { cause: error })
		}
	}

	/** `getItem` for the scanning paths, where an unreadable entry is simply not ours. */
	const peekItem = (name: string): string | null => {
		try {
			return area().getItem(name)
		} catch {
			return null
		}
	}

	const removeItem = (name: string): void => {
		try {
			area().removeItem(name)
		} catch (error) {
			if (isBlockedError(error)) {
				throw new StorageError(
					`Cannot delete ${describeKey(name)}: storage access is blocked in this environment.`,
					'STORAGE_UNAVAILABLE',
					{ cause: error }
				)
			}
			throw new StorageError(`Cannot delete ${describeKey(name)}.`, 'WRITE_FAILED', { cause: error })
		}
	}

	/** Whether the raw stored value carries this library's format tag. */
	const isOwned = (raw: string | null): boolean =>
		raw !== null && (raw.startsWith(PLAIN_PREFIX) || raw.startsWith(ENCRYPTED_PREFIX))

	/**
	 * Decode a tagged raw value. The encryption context is the storage identity
	 * plus the fully qualified key, so a payload copied to another key, another
	 * namespace or another driver fails to decrypt.
	 */
	const decodeValue = (key: string, raw: string): unknown => {
		if (raw.startsWith(ENCRYPTED_PREFIX)) {
			return parseValue(key, decrypt(raw.slice(ENCRYPTED_PREFIX.length), `${id}\u0000${prefix}${key}`))
		}
		return parseValue(key, raw.slice(PLAIN_PREFIX.length))
	}

	/** Raw value under the key, but only when this library wrote it. */
	const ownedRaw = (key: string): string | null => {
		const raw = getItem(prefix + key)
		return isOwned(raw) ? raw : null
	}

	const get = <T = unknown>(key: string, validate?: (value: unknown) => value is T): T | null =>
		read(() => {
			const raw = ownedRaw(key)
			if (raw === null) return null

			const value = decodeValue(key, raw)
			if (validate && !validate(value)) {
				throw new StorageError(`Stored value of ${describeKey(key)} failed validation.`, 'PARSE_FAILED')
			}
			return value as T
		})

	const set = (key: string, value: unknown, setOptions?: SetOptions): void => {
		// Per-call option > driver option > global default.
		const encryptThis = setOptions?.encrypt ?? options.encrypt ?? getConfig().encryptByDefault
		const json = serializeValue(key, value)
		const data = encryptThis
			? `${ENCRYPTED_PREFIX}${encrypt(json, `${id}\u0000${prefix}${key}`)}`
			: `${PLAIN_PREFIX}${json}`

		try {
			area().setItem(prefix + key, data)
		} catch (error) {
			if (isQuotaError(error)) {
				throw new StorageError(`Cannot write ${describeKey(key)}: the storage quota is exceeded.`, 'QUOTA_EXCEEDED', {
					cause: error
				})
			}
			if (isBlockedError(error)) {
				throw new StorageError(
					`Cannot write ${describeKey(key)}: storage access is blocked in this environment.`,
					'STORAGE_UNAVAILABLE',
					{ cause: error }
				)
			}
			throw new StorageError(`Cannot write ${describeKey(key)}.`, 'WRITE_FAILED', { cause: error })
		}
	}

	// `read` yields `null` under the `ignore` policy; coerce so `has` stays a boolean.
	// Existence is the format tag alone: no decryption needed to answer it.
	const has = (key: string): boolean => read(() => ownedRaw(key) !== null) ?? false

	/**
	 * Names of every key this driver owns, as stored (prefix included).
	 *
	 * With a `prefix` this is a name-only scan; without one every value has to be
	 * read to check its format tag. Unreadable entries are skipped rather than
	 * thrown: one broken entry must not hide the rest.
	 */
	const scanOwned = (): string[] => {
		const store = area()
		const found: string[] = []
		const probeName = `${prefix}${PROBE_SUFFIX}`
		for (let index = 0; index < store.length; index++) {
			let name: string | null = null
			try {
				name = store.key(index)
			} catch {
				continue
			}
			// A probe write interrupted by a crash can outlive it; it is ours, but
			// it is not a value anyone stored.
			if (name === null || name === probeName) continue

			if (prefix) {
				if (name.startsWith(prefix)) found.push(name)
			} else if (isOwned(peekItem(name))) {
				found.push(name)
			}
		}
		return found
	}

	/** Logical names of this library's keys, with the namespace stripped. */
	const ownedKeys = (): string[] => scanOwned().map(name => (prefix ? name.slice(prefix.length) : name))

	const remove = (key: string): void => {
		// Without a namespace, only delete a key this library actually wrote.
		if (!prefix && !isOwned(peekItem(key))) return
		removeItem(prefix + key)
	}

	/** Only remove keys this library wrote, identified by the format tag. */
	const clear = (): void => {
		for (const name of scanOwned()) removeItem(name)
	}

	const clearAll = (): void => {
		try {
			area().clear()
		} catch (error) {
			if (isBlockedError(error)) {
				throw new StorageError(
					'Cannot clear storage: storage access is blocked in this environment.',
					'STORAGE_UNAVAILABLE',
					{ cause: error }
				)
			}
			throw new StorageError('Cannot clear storage.', 'WRITE_FAILED', { cause: error })
		}
	}

	return {
		get,
		set,
		has,
		remove,
		clear,
		clearAll,
		keys: ownedKeys,
		get isPersistent() {
			area()
			return persistent === true
		}
	}
}
