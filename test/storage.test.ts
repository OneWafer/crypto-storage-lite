/*
 * @Author: OneWafer
 * @Description: Tests for the storage driver: values, ownership, encryption and isolation
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { configureStorage, resetConfig } from '../lib/config'
import { createStorage } from '../lib/storage'
import { createFakeArea, type FakeArea } from './helpers'

const build = (
	options = {},
	initial?: Record<string, string>
): { driver: ReturnType<typeof createStorage>; fake: FakeArea } => {
	const fake = createFakeArea(initial)
	return { driver: createStorage(() => fake.area, options), fake }
}

beforeEach(() => {
	resetConfig()
})

describe('values', () => {
	it('round-trips JSON values', () => {
		const { driver } = build()
		const values = ['text', 42, 0, -1.5, true, false, null, { a: 1, b: [2, { c: 3 }] }, [], { nested: { deep: 'x' } }]
		for (const value of values) {
			driver.set('k', value)
			expect(driver.get('k')).toEqual(value)
		}
	})

	it('returns null for a missing key', () => {
		const { driver } = build()
		expect(driver.get('nope')).toBeNull()
		expect(driver.has('nope')).toBe(false)
	})

	it('rejects undefined with a pointer to remove()', () => {
		const { driver } = build()
		expect(() => driver.set('k', undefined)).toThrowError(
			expect.objectContaining({ code: 'SERIALIZE_FAILED', message: expect.stringContaining('remove()') })
		)
	})

	it('rejects functions and symbols, including nested ones, instead of writing a lossy value', () => {
		const { driver, fake } = build()
		const cases: unknown[] = [() => 1, Symbol('s'), { nested: () => 1 }, { deeper: { fn: () => 1 } }, [1, () => 1]]
		for (const value of cases) {
			expect(() => driver.set('k', value)).toThrowError(expect.objectContaining({ code: 'SERIALIZE_FAILED' }))
		}
		expect(fake.raw.size).toBe(0)
	})

	it('rejects circular references and BigInt', () => {
		const { driver } = build()
		const circular: Record<string, unknown> = {}
		circular.self = circular
		expect(() => driver.set('k', circular)).toThrowError(expect.objectContaining({ code: 'SERIALIZE_FAILED' }))
		expect(() => driver.set('k', 1n)).toThrowError(expect.objectContaining({ code: 'SERIALIZE_FAILED' }))
	})

	it('writes plain values tagged `cs1p:` and encrypted values tagged `cs1e:`', () => {
		const { driver, fake } = build()
		driver.set('plain', { a: 1 })
		driver.set('secret', 'value', { encrypt: true })
		expect(fake.raw.get('plain')).toBe('cs1p:{"a":1}')
		expect(fake.raw.get('secret')!.startsWith('cs1e:')).toBe(true)
		expect(fake.raw.get('secret')).not.toContain('value')
	})

	it('distinguishes a stored null from a missing key via has()', () => {
		const { driver } = build()
		driver.set('k', null)
		expect(driver.get('k')).toBeNull()
		expect(driver.has('k')).toBe(true)
	})

	it('treats malformed stored JSON as PARSE_FAILED', () => {
		const { driver } = build({}, { k: 'cs1p:{not json' })
		expect(() => driver.get('k')).toThrowError(expect.objectContaining({ code: 'PARSE_FAILED' }))
	})
})

describe('get with a validator', () => {
	it('returns the value when the validator passes', () => {
		const { driver } = build()
		driver.set('user', { name: 'ada' })
		const user = driver.get('user', (v): v is { name: string } => typeof v === 'object' && v !== null && 'name' in v)
		expect(user).toEqual({ name: 'ada' })
	})

	it('reports a failing validator like corrupted data', () => {
		const { driver } = build()
		driver.set('user', { name: 'ada' })
		expect(() => driver.get('user', (v): v is string => typeof v === 'string')).toThrowError(
			expect.objectContaining({ code: 'PARSE_FAILED', message: expect.stringContaining('failed validation') })
		)
	})

	it('does not run the validator for a missing key', () => {
		const { driver } = build()
		let calls = 0
		const validate = (v: unknown): v is string => {
			calls += 1
			return typeof v === 'string'
		}
		expect(driver.get('missing', validate)).toBeNull()
		expect(calls).toBe(0)
	})
})

describe('ownership', () => {
	it('does not read values written by something else', () => {
		const { driver } = build({}, { foreign: '{"a":1}', other: 'my-app:{"a":1}' })
		expect(driver.get('foreign')).toBeNull()
		expect(driver.get('other')).toBeNull()
		expect(driver.has('foreign')).toBe(false)
	})

	it('ignores a format tag from another version', () => {
		// The version digit is the escape hatch for an incompatible future shape:
		// values from `cs2` must not be parsed as if they were `cs1`.
		const { driver, fake } = build({}, { future: 'cs2p:{"a":1}', older: 'cs0p:{"a":1}' })
		expect(driver.get('future')).toBeNull()
		expect(driver.get('older')).toBeNull()
		driver.clear()
		expect([...fake.raw.keys()]).toEqual(['future', 'older'])
	})

	it('clear() removes only its own keys', () => {
		const { driver, fake } = build({}, { foreign: 'other data' })
		driver.set('a', 1)
		driver.set('b', 'secret', { encrypt: true })
		driver.clear()
		expect([...fake.raw.keys()]).toEqual(['foreign'])
		expect(driver.keys()).toEqual([])
	})

	it('remove() leaves a foreign key under the same name alone', () => {
		const { driver, fake } = build({}, { shared: 'not mine' })
		driver.remove('shared')
		expect(fake.raw.get('shared')).toBe('not mine')
	})

	it('remove() deletes a key this library wrote', () => {
		const { driver, fake } = build()
		driver.set('k', 1)
		driver.remove('k')
		expect(fake.raw.has('k')).toBe(false)
		expect(driver.has('k')).toBe(false)
	})

	it('clearAll() clears the whole area', () => {
		const { driver, fake } = build({}, { foreign: 'x' })
		driver.set('a', 1)
		driver.clearAll()
		expect(fake.raw.size).toBe(0)
	})

	it('keys() lists only its own logical names', () => {
		const { driver } = build({}, { foreign: 'x' })
		driver.set('a', 1)
		driver.set('b', 2)
		expect(driver.keys().sort()).toEqual(['a', 'b'])
	})

	it('keys() ignores a probe key left behind by an interrupted write', () => {
		const { driver } = build({}, { a: 'cs1p:1', '__crypto-storage-lite_probe__': '1' })
		expect(driver.keys()).toEqual(['a'])
		driver.clear()
		// The stale probe key is not a value, but it is ours, so clear() reaps it.
		expect(driver.keys()).toEqual([])
	})
})

describe('encryption', () => {
	it('round-trips encrypted values', () => {
		const { driver } = build()
		driver.set('token', { refresh: 'abc' }, { encrypt: true })
		expect(driver.get('token')).toEqual({ refresh: 'abc' })
	})

	it('encrypts by default when configured globally, and per-call opts out', () => {
		configureStorage({ encryptByDefault: true })
		const { driver, fake } = build()
		driver.set('a', 'x')
		driver.set('b', 'y', { encrypt: false })
		expect(fake.raw.get('a')!.startsWith('cs1e:')).toBe(true)
		expect(fake.raw.get('b')!.startsWith('cs1p:')).toBe(true)
		expect(driver.get('a')).toBe('x')
		expect(driver.get('b')).toBe('y')
	})

	it('lets the driver option override the global default', () => {
		configureStorage({ encryptByDefault: false })
		const { driver, fake } = build({ encrypt: true })
		driver.set('a', 'x', { encrypt: false })
		driver.set('b', 'y')
		expect(fake.raw.get('a')!.startsWith('cs1p:')).toBe(true)
		expect(fake.raw.get('b')!.startsWith('cs1e:')).toBe(true)
	})

	it('refuses to write encrypted data when getRandomValues is unavailable', () => {
		const { driver, fake } = build()
		const original = globalThis.crypto
		Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true })
		try {
			expect(() => driver.set('k', 1, { encrypt: true })).toThrowError(
				expect.objectContaining({ code: 'CRYPTO_UNAVAILABLE' })
			)
			expect(fake.raw.size).toBe(0)
			// Plain writes still work.
			driver.set('plain', 1)
			expect(driver.get('plain')).toBe(1)
		} finally {
			Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true, writable: true })
		}
	})
})

describe('isolation between drivers', () => {
	it('cannot decrypt a ciphertext copied from another driver', () => {
		const fake = createFakeArea()
		const from = createStorage(() => fake.area, { id: 'local' })
		const to = createStorage(() => fake.area, { id: 'session' })

		from.set('token', 'secret', { encrypt: true })
		fake.raw.set('token', fake.raw.get('token')!)
		expect(() => to.get('token')).toThrowError(expect.objectContaining({ code: 'DECRYPT_FAILED' }))
	})

	it('cannot decrypt a ciphertext moved to another key', () => {
		const { driver, fake } = build({ id: 'app' })
		driver.set('a', 'secret', { encrypt: true })
		fake.raw.set('b', fake.raw.get('a')!)
		expect(() => driver.get('b')).toThrowError(expect.objectContaining({ code: 'DECRYPT_FAILED' }))
	})

	it('cannot decrypt a ciphertext moved to another namespace', () => {
		const fake = createFakeArea()
		const one = createStorage(() => fake.area, { id: 'app', prefix: 'a:' })
		const two = createStorage(() => fake.area, { id: 'app', prefix: 'b:' })
		one.set('k', 'secret', { encrypt: true })
		fake.raw.set('b:k', fake.raw.get('a:k')!)
		expect(() => two.get('k')).toThrowError(expect.objectContaining({ code: 'DECRYPT_FAILED' }))
	})

	it('reports tampered ciphertext as DECRYPT_FAILED', () => {
		const { driver, fake } = build()
		driver.set('k', 'secret', { encrypt: true })
		const raw = fake.raw.get('k')!
		fake.raw.set('k', `${raw.slice(0, -4)}AAAA`)
		expect(() => driver.get('k')).toThrowError(expect.objectContaining({ code: 'DECRYPT_FAILED' }))
	})
})

describe('prefix namespace', () => {
	it('stores keys under the prefix and reports the logical names', () => {
		const fake = createFakeArea({ foreign: 'x' })
		const driver = createStorage(() => fake.area, { id: 'app', prefix: 'app:' })
		driver.set('a', 1)
		expect([...fake.raw.keys()].sort()).toEqual(['app:a', 'foreign'])
		expect(driver.keys()).toEqual(['a'])
		expect(driver.get('a')).toBe(1)
	})

	it('selects by name, so its own keys survive even when the tag is unrecognised', () => {
		const fake = createFakeArea({ 'app:a': 'not our format', 'app:b': 'cs1p:2', other: 'cs1p:3' })
		const driver = createStorage(() => fake.area, { id: 'app', prefix: 'app:' })
		expect(driver.keys().sort()).toEqual(['a', 'b'])
		driver.clear()
		expect([...fake.raw.keys()]).toEqual(['other'])
	})

	it('remove() only touches its own namespace', () => {
		const fake = createFakeArea({ 'app:k': 'cs1p:1', k: 'cs1p:2' })
		const driver = createStorage(() => fake.area, { id: 'app', prefix: 'app:' })
		driver.remove('k')
		expect(fake.raw.has('app:k')).toBe(false)
		expect(fake.raw.get('k')).toBe('cs1p:2')
	})
})
