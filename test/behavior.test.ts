/*
 * @Author: OneWafer
 * @Description: Tests for error policy, fallbacks, quota/blocked handling and config
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureStorage, getConfig, resetConfig } from '../lib/config'
import { StorageError } from '../lib/error'
import { createStorage } from '../lib/storage'
import { createFailableArea, namedError } from './helpers'

beforeEach(() => {
	resetConfig()
})

afterEach(() => {
	vi.restoreAllMocks()
})

describe('onError policy', () => {
	const corrupt = { k: 'cs1p:{not json' }

	it('throws by default', () => {
		const fake = createFailableArea(corrupt)
		const driver = createStorage(() => fake.area)
		expect(() => driver.get('k')).toThrowError(expect.objectContaining({ code: 'PARSE_FAILED' }))
		expect(() => driver.get('k', ((): boolean => false) as unknown as (v: unknown) => v is string)).toThrowError(
			StorageError
		)
	})

	it('answers has() from the format tag alone, without decrypting', () => {
		const fake = createFailableArea({
			corrupt: 'cs1p:{not json',
			encrypted: `cs1e:${'A'.repeat(64)}`,
			foreign: '{"a":1}'
		})
		const driver = createStorage(() => fake.area)
		// Existence, not readability: neither a broken body nor a bad ciphertext is
		// decrypted just to answer has().
		expect(driver.has('corrupt')).toBe(true)
		expect(driver.has('encrypted')).toBe(true)
		expect(driver.has('foreign')).toBe(false)
	})

	it("resolves to null and warns once per get when 'ignore'", () => {
		configureStorage({ onError: 'ignore' })
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const fake = createFailableArea(corrupt)
		const driver = createStorage(() => fake.area)

		expect(driver.get('k')).toBeNull()
		expect(warn).toHaveBeenCalledTimes(1)
		expect(warn.mock.calls[0]![0]).toContain('crypto-storage-lite')
	})

	it('passes the error to a handler function', () => {
		const seen: StorageError[] = []
		configureStorage({ onError: error => seen.push(error) })
		const fake = createFailableArea(corrupt)
		const driver = createStorage(() => fake.area)

		expect(driver.get('k')).toBeNull()
		expect(seen).toHaveLength(1)
		expect(seen[0]!.code).toBe('PARSE_FAILED')
	})

	it('does not swallow errors that are not StorageError', () => {
		configureStorage({ onError: 'ignore' })
		const fake = createFailableArea()
		const driver = createStorage(() => fake.area)
		// A validator that throws a bug is not a storage failure and must escape.
		driver.set('k', 1)
		const throwing = (() => {
			throw new TypeError('bug')
		}) as unknown as (value: unknown) => value is string
		expect(() => driver.get('k', throwing)).toThrowError(TypeError)
	})

	it('applies the ignore policy to a rejected validator', () => {
		configureStorage({ onError: 'ignore' })
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const fake = createFailableArea()
		const driver = createStorage(() => fake.area)
		driver.set('k', 1)
		expect(driver.get('k', (value): value is string => typeof value === 'string')).toBeNull()
		expect(warning).toHaveBeenCalledTimes(1)
	})

	it('never applies the policy to writes', () => {
		configureStorage({ onError: 'ignore' })
		const fake = createFailableArea()
		fake.fail(['setItem'], namedError('QuotaExceededError'))
		const driver = createStorage(() => fake.area)
		expect(() => driver.set('k', 1)).toThrowError(expect.objectContaining({ code: 'QUOTA_EXCEEDED' }))
	})
})

describe('storage probes', () => {
	it.each(['', 'app:'])('preserves data under the former fixed probe key (prefix=%s)', prefix => {
		const name = `${prefix}__crypto-storage-lite_probe__`
		const fake = createFailableArea({ [name]: 'business data' })
		const driver = createStorage(() => fake.area, { prefix })
		expect(driver.get('missing')).toBeNull()
		expect(driver.isPersistent).toBe(true)
		expect([...fake.raw.entries()]).toEqual([[name, 'business data']])
	})

	it('skips a generated probe key when it already exists', () => {
		vi.spyOn(Date, 'now').mockReturnValue(0)
		vi.spyOn(Math, 'random').mockReturnValue(0.25)
		const fake = createFailableArea()
		const reading = vi.spyOn(fake.area, 'getItem').mockImplementationOnce(name => {
			fake.raw.set(name, 'existing data')
			return 'existing data'
		})
		const writing = vi.spyOn(fake.area, 'setItem')
		const driver = createStorage(() => fake.area)
		expect(driver.isPersistent).toBe(true)
		const occupiedName = reading.mock.calls[0]![0]
		expect([...fake.raw.entries()]).toEqual([[occupiedName, 'existing data']])
		expect(writing).toHaveBeenCalledTimes(1)
		expect(writing.mock.calls[0]![0]).not.toBe(occupiedName)
	})

	it('cleans up the probe when verification throws', () => {
		const fake = createFailableArea()
		vi.spyOn(fake.area, 'getItem').mockImplementation(name => {
			if (fake.raw.has(name)) throw namedError('SecurityError')
			return null
		})
		const driver = createStorage(() => fake.area)
		expect(driver.isPersistent).toBe(false)
		expect(fake.raw.size).toBe(0)
		driver.set('k', 'memory')
		expect(driver.get('k')).toBe('memory')
	})

	it('attempts cleanup when a probe write stores data and then throws', () => {
		const fake = createFailableArea()
		vi.spyOn(fake.area, 'setItem').mockImplementation((name, value) => {
			fake.raw.set(name, value)
			throw namedError('SecurityError')
		})
		const removing = vi.spyOn(fake.area, 'removeItem')
		const driver = createStorage(() => fake.area)
		expect(driver.isPersistent).toBe(false)
		expect(removing).toHaveBeenCalledTimes(1)
		expect(fake.raw.size).toBe(0)
	})

	it('cleans up a probe that does not read back correctly', () => {
		const fake = createFailableArea()
		vi.spyOn(fake.area, 'getItem').mockImplementation(name => (fake.raw.has(name) ? 'not accepted' : null))
		const driver = createStorage(() => fake.area)
		expect(driver.isPersistent).toBe(false)
		expect(fake.raw.size).toBe(0)
	})

	it('does not write or delete anything when the collision check fails', () => {
		const fake = createFailableArea({ keep: 'cs1p:1' })
		fake.fail(['getItem'], namedError('SecurityError'))
		const writing = vi.spyOn(fake.area, 'setItem')
		const removing = vi.spyOn(fake.area, 'removeItem')
		const driver = createStorage(() => fake.area)
		expect(driver.isPersistent).toBe(false)
		expect(writing).not.toHaveBeenCalled()
		expect(removing).not.toHaveBeenCalled()
		expect(fake.raw.get('keep')).toBe('cs1p:1')
	})

	it('keeps existing data readable when both probe writing and cleanup report quota errors', () => {
		const fake = createFailableArea({ keep: 'cs1p:"old"' })
		fake.fail(['setItem', 'removeItem'], namedError('QuotaExceededError'))
		const driver = createStorage(() => fake.area)
		expect(driver.get('keep')).toBe('old')
		expect(driver.isPersistent).toBe(true)
		expect(() => driver.set('k', 'new')).toThrowError(expect.objectContaining({ code: 'QUOTA_EXCEEDED' }))
		expect(fake.raw.get('keep')).toBe('cs1p:"old"')
	})

	it('falls back without throwing when probe cleanup is blocked', () => {
		const fake = createFailableArea()
		fake.fail(['removeItem'], namedError('SecurityError'))
		const removing = vi.spyOn(fake.area, 'removeItem')
		const driver = createStorage(() => fake.area)
		expect(driver.isPersistent).toBe(false)
		expect(removing).toHaveBeenCalledTimes(1)
		driver.set('k', 'memory')
		expect(driver.get('k')).toBe('memory')
	})
})

describe('quota, blocked storage and fallback', () => {
	it('maps a quota error to QUOTA_EXCEEDED but keeps using the real area', () => {
		const fake = createFailableArea({ keep: 'cs1p:"old"' })
		const driver = createStorage(() => fake.area)
		expect(driver.get('keep')).toBe('old')
		fake.fail(['setItem'], namedError('QuotaExceededError'))
		expect(driver.isPersistent).toBe(true)
		expect(() => driver.set('k', 1)).toThrowError(expect.objectContaining({ code: 'QUOTA_EXCEEDED' }))
		// Existing data stays readable; nothing was silently moved to memory.
		expect(driver.get('keep')).toBe('old')
	})

	it('recognises the legacy numeric quota code', () => {
		const fake = createFailableArea({ keep: 'cs1p:1' })
		const driver = createStorage(() => fake.area)
		driver.get('keep')
		const legacy = Object.assign(new Error('full'), { code: 22 })
		fake.fail(['setItem'], legacy)
		expect(() => driver.set('k', 1)).toThrowError(expect.objectContaining({ code: 'QUOTA_EXCEEDED' }))
	})

	it('falls back to memory when the area rejects the probe write', () => {
		const fake = createFailableArea()
		fake.fail(['setItem'], namedError('SecurityError'))
		const driver = createStorage(() => fake.area)
		expect(driver.isPersistent).toBe(false)
		driver.set('k', { a: 1 })
		expect(driver.get('k')).toEqual({ a: 1 })
		expect(fake.raw.size).toBe(0)
	})

	it('falls back to memory when there is no area at all (SSR)', () => {
		const driver = createStorage(() => null)
		expect(driver.isPersistent).toBe(false)
		driver.set('k', 'v')
		expect(driver.get('k')).toBe('v')
	})

	it('keeps request-scoped memory drivers independent', () => {
		const createRequestStorage = () => createStorage(() => null)
		const first = createRequestStorage()
		const second = createRequestStorage()
		first.set('user', { id: 'first' })
		expect(second.get('user')).toBeNull()
		second.set('user', { id: 'second' })
		first.clear()
		expect(first.get('user')).toBeNull()
		expect(second.get('user')).toEqual({ id: 'second' })
	})

	it('does not automatically reconnect after falling back to memory', () => {
		const fake = createFailableArea()
		let available = false
		const driver = createStorage(() => (available ? fake.area : null))
		driver.set('k', 'memory')
		available = true
		expect(driver.isPersistent).toBe(false)
		expect(driver.get('k')).toBe('memory')
		expect(fake.raw.size).toBe(0)
	})

	it('falls back to memory when the resolver throws', () => {
		const driver = createStorage(() => {
			throw new Error('no window')
		})
		expect(driver.isPersistent).toBe(false)
		driver.set('k', 1)
		expect(driver.get('k')).toBe(1)
	})

	it('downgrades at runtime when reads start being refused', () => {
		const fake = createFailableArea()
		const driver = createStorage(() => fake.area)
		driver.set('a', 1)
		fake.fail(['getItem'], namedError('SecurityError'))

		expect(() => driver.get('a')).toThrowError(expect.objectContaining({ code: 'READ_FAILED' }))
		expect(driver.isPersistent).toBe(false)
		driver.set('b', 2)
		expect(driver.get('b')).toBe(2)
	})

	it('maps a blocked write to STORAGE_UNAVAILABLE', () => {
		const fake = createFailableArea()
		const driver = createStorage(() => fake.area)
		driver.get('anything') // probe succeeds
		fake.fail(['setItem'], namedError('SecurityError'))
		expect(() => driver.set('k', 1)).toThrowError(expect.objectContaining({ code: 'STORAGE_UNAVAILABLE' }))
	})

	it('maps other write failures to WRITE_FAILED', () => {
		const fake = createFailableArea()
		const driver = createStorage(() => fake.area)
		driver.get('anything')
		fake.fail(['setItem'], new Error('disk on fire'))
		expect(() => driver.set('k', 1)).toThrowError(expect.objectContaining({ code: 'WRITE_FAILED' }))
	})

	it('reports a failing remove() as a StorageError', () => {
		const fake = createFailableArea({ k: 'cs1p:1' })
		const driver = createStorage(() => fake.area)
		driver.get('k')
		fake.fail(['removeItem'], namedError('SecurityError'))
		expect(() => driver.remove('k')).toThrowError(expect.objectContaining({ code: 'STORAGE_UNAVAILABLE' }))
	})

	it.each(['throw', 'ignore'] as const)('reports a failed ownership read during remove with onError=%s', onError => {
		configureStorage({ onError })
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const fake = createFailableArea({ k: 'cs1p:1' })
		const driver = createStorage(() => fake.area)
		driver.get('k')
		const cause = new Error('temporary read failure')
		fake.fail(['getItem'], cause)
		expect(() => driver.remove('k')).toThrowError(expect.objectContaining({ code: 'READ_FAILED', cause }))
		expect(fake.raw.get('k')).toBe('cs1p:1')
		expect(driver.isPersistent).toBe(true)
		expect(warning).not.toHaveBeenCalled()
	})

	it('does not call the read-error handler for a failed ownership read during remove', () => {
		const handler = vi.fn()
		configureStorage({ onError: handler })
		const fake = createFailableArea({ k: 'cs1p:1' })
		const driver = createStorage(() => fake.area)
		driver.get('k')
		fake.fail(['getItem'], namedError('SecurityError'))
		expect(() => driver.remove('k')).toThrowError(expect.objectContaining({ code: 'READ_FAILED' }))
		expect(fake.raw.get('k')).toBe('cs1p:1')
		expect(driver.isPersistent).toBe(false)
		expect(handler).not.toHaveBeenCalled()
	})

	it('reports a failing clear() as a StorageError', () => {
		const fake = createFailableArea({ k: 'cs1p:1' })
		const driver = createStorage(() => fake.area)
		driver.get('k')
		fake.fail(['removeItem'], namedError('SecurityError'))
		expect(() => driver.clear()).toThrowError(expect.objectContaining({ code: 'STORAGE_UNAVAILABLE' }))
	})

	it('reports a failing clearAll() as a StorageError', () => {
		const fake = createFailableArea()
		const driver = createStorage(() => fake.area)
		driver.get('k')
		fake.fail(['clear'], namedError('SecurityError'))
		expect(() => driver.clearAll()).toThrowError(expect.objectContaining({ code: 'STORAGE_UNAVAILABLE' }))
	})

	it('skips unreadable entries when scanning instead of throwing', () => {
		// A getItem that fails for one key but works for others.
		const raw = new Map([
			['a', 'cs1p:1'],
			['b', 'cs1p:2']
		])
		const area: Storage = {
			get length() {
				return raw.size
			},
			key: index => [...raw.keys()][index] ?? null,
			getItem: key => {
				if (key === 'b') throw namedError('SecurityError')
				return raw.get(key) ?? null
			},
			setItem: (key, value) => void raw.set(key, value),
			removeItem: key => void raw.delete(key),
			clear: () => raw.clear()
		}
		const driver = createStorage(() => area)
		expect(driver.keys()).toEqual(['a'])
	})
})

describe('configureStorage', () => {
	it('starts with defaults', () => {
		expect(getConfig()).toEqual({ onError: 'throw', encryptByDefault: false, key: null })
	})

	it('merges successive calls', () => {
		configureStorage({ encryptByDefault: true })
		configureStorage({ onError: 'ignore' })
		expect(getConfig()).toMatchObject({ onError: 'ignore', encryptByDefault: true })
	})

	it('rejects non-object configuration without changing the defaults', () => {
		for (const value of [null, 0, true, 'configuration']) {
			expect(() => configureStorage(value as never)).toThrowError(TypeError)
			expect(getConfig()).toEqual({ onError: 'throw', encryptByDefault: false, key: null })
		}
	})

	it('rejects an invalid onError', () => {
		expect(() => configureStorage({ onError: 'nope' as never })).toThrowError(TypeError)
	})

	it('rejects a key that is not 32 bytes', () => {
		expect(() => configureStorage({ key: new Uint8Array(16) })).toThrowError(TypeError)
		expect(() => configureStorage({ key: new Uint8Array(33) })).toThrowError(TypeError)
	})

	it('rejects non-boolean encryption defaults', () => {
		for (const value of [null, 0, 1, 'false', {}, []]) {
			expect(() => configureStorage({ encryptByDefault: value as never })).toThrowError(TypeError)
		}
	})

	it('rejects values that only look like 32-byte keys', () => {
		const disguised = Object.defineProperty(new Uint8ClampedArray(32), Symbol.toStringTag, { value: 'Uint8Array' })
		const cases: unknown[] = [
			null,
			'x'.repeat(32),
			new Array(32).fill(1),
			{ length: 32 },
			new DataView(new ArrayBuffer(32)),
			new Uint16Array(32),
			new Int8Array(32),
			new Uint8ClampedArray(32),
			disguised
		]
		for (const key of cases) {
			expect(() => configureStorage({ key: key as never })).toThrowError(TypeError)
		}
	})

	it('accepts and copies a Uint8Array from another execution realm', async () => {
		const { runInNewContext } = await vi.importActual<{ runInNewContext: (source: string) => Uint8Array }>('node:vm')
		const key = runInNewContext('new Uint8Array(32).fill(7)')
		expect(key instanceof Uint8Array).toBe(false)
		configureStorage({ key })
		key.fill(9)
		expect(getConfig().key).toEqual(new Uint8Array(32).fill(7))
	})

	it('copies only the bytes in a 32-byte key view', () => {
		const buffer = new Uint8Array(64).fill(5)
		configureStorage({ key: buffer.subarray(16, 48) })
		buffer.fill(9)
		expect(getConfig().key).toEqual(new Uint8Array(32).fill(5))
	})

	it('does not partially update configuration when validation fails', () => {
		configureStorage({ key: new Uint8Array(32).fill(1) })
		const previous = getConfig()
		expect(() => configureStorage({ onError: 'ignore', encryptByDefault: true, key: new Uint8Array(16) })).toThrowError(
			TypeError
		)
		expect(getConfig()).toEqual(previous)
		expect(() => configureStorage({ onError: 'ignore', encryptByDefault: 'false' as never })).toThrowError(TypeError)
		expect(getConfig()).toEqual(previous)
	})

	it('returns independent key buffers in configuration snapshots', () => {
		configureStorage({ key: new Uint8Array(32).fill(1) })
		const first = getConfig()
		const second = getConfig()
		expect(Object.isFrozen(first)).toBe(true)
		expect(first.key).not.toBe(second.key)
		expect(first.key!.buffer).not.toBe(second.key!.buffer)
		first.key!.fill(9)
		new Uint8Array(second.key!.buffer).fill(8)
		configureStorage({ onError: 'ignore' })
		expect(getConfig().key).toEqual(new Uint8Array(32).fill(1))
	})

	it('copies the key so later mutation of the caller buffer has no effect', () => {
		const key = new Uint8Array(32).fill(1)
		configureStorage({ key })
		key.fill(9)
		expect(getConfig().key).toEqual(new Uint8Array(32).fill(1))
	})

	it('returns a frozen config object', () => {
		expect(Object.isFrozen(getConfig())).toBe(true)
	})

	it('resetConfig() restores the defaults', () => {
		configureStorage({ onError: 'ignore', encryptByDefault: true, key: new Uint8Array(32) })
		resetConfig()
		expect(getConfig()).toEqual({ onError: 'throw', encryptByDefault: false, key: null })
	})
})
