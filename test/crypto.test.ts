/*
 * @Author: OneWafer
 * @Description: Tests for the AES-GCM layer
 */
import { describe, expect, it } from 'vitest'
import { configureStorage, getConfig, resetConfig } from '../lib/config'
import { decrypt, encrypt, isCryptoAvailable } from '../lib/crypto'
import { isStorageError } from '../lib/error'

const bytes = (length: number, fill = 0): Uint8Array => new Uint8Array(length).fill(fill)

const decodeBase64 = (value: string): Uint8Array => Uint8Array.from(atob(value), char => char.charCodeAt(0))

/** Flip one base64 character, keeping the alphabet valid so the payload still parses. */
const flipChar = (value: string, index: number): string => {
	const char = value[index]!
	const replacement = char === 'A' ? 'B' : 'A'
	return `${value.slice(0, index)}${replacement}${value.slice(index + 1)}`
}

describe('encrypt / decrypt', () => {
	it('round-trips text, including non-ASCII and empty strings', () => {
		resetConfig()
		for (const plaintext of ['', 'hello', '你好，世界 🌍', 'line\nbreak\ttab']) {
			expect(decrypt(encrypt(plaintext))).toBe(plaintext)
		}
	})

	it('produces a different ciphertext for the same plaintext (fresh IV per write)', () => {
		resetConfig()
		const a = encrypt('same')
		const b = encrypt('same')
		expect(a).not.toBe(b)
		expect(a.split('.')[0]).not.toBe(b.split('.')[0])
	})

	it('uses a 12-byte IV and emits `<iv>.<ciphertext>` in base64', () => {
		resetConfig()
		const [iv, ciphertext] = encrypt('x').split('.')
		expect(decodeBase64(iv!)).toHaveLength(12)
		expect(ciphertext).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
		expect(decodeBase64(ciphertext!)).toHaveLength('x'.length + 16) // plaintext + GCM tag
	})

	it('binds the context: a payload cannot be decrypted under another context', () => {
		resetConfig()
		const payload = encrypt('secret', 'local\u0000token')
		expect(decrypt(payload, 'local\u0000token')).toBe('secret')
		expect(() => decrypt(payload, 'session\u0000token')).toThrowError(
			expect.objectContaining({ code: 'DECRYPT_FAILED' })
		)
		expect(() => decrypt(payload)).toThrowError(expect.objectContaining({ code: 'DECRYPT_FAILED' }))
	})

	it('rejects a tampered IV', () => {
		resetConfig()
		const [iv, ciphertext] = encrypt('secret').split('.')
		const tampered = `${flipChar(iv!, 4)}.${ciphertext}`
		expect(() => decrypt(tampered)).toThrowError(expect.objectContaining({ code: 'DECRYPT_FAILED' }))
	})

	it('rejects a tampered ciphertext', () => {
		resetConfig()
		const [iv, ciphertext] = encrypt('secret').split('.')
		const tampered = `${iv}.${flipChar(ciphertext!, 4)}`
		expect(() => decrypt(tampered)).toThrowError(expect.objectContaining({ code: 'DECRYPT_FAILED' }))
	})

	it('rejects a truncated ciphertext', () => {
		resetConfig()
		const [iv, ciphertext] = encrypt('secret').split('.')
		expect(() => decrypt(`${iv}.${ciphertext!.slice(0, -8)}`)).toThrowError(
			expect.objectContaining({ code: 'DECRYPT_FAILED' })
		)
	})

	it('reports malformed payloads as PARSE_FAILED', () => {
		resetConfig()
		const valid = encrypt('x').split('.')[1]
		for (const payload of ['', 'nodot', '.onlyciphertext', 'onlyiv.', 'not-base64!.AAAA', 'AAAA', `AAAA.${valid}`]) {
			expect(() => decrypt(payload)).toThrowError(expect.objectContaining({ code: 'PARSE_FAILED' }))
		}
	})

	it('fails to decrypt with a different key', () => {
		resetConfig()
		const payload = encrypt('secret')
		configureStorage({ key: bytes(32, 7) })
		expect(() => decrypt(payload)).toThrowError(expect.objectContaining({ code: 'DECRYPT_FAILED' }))
	})

	it('follows the key set through configureStorage', () => {
		resetConfig()
		configureStorage({ key: bytes(32, 1) })
		expect(decrypt(encrypt('with custom key'))).toBe('with custom key')
	})

	it('keeps ciphertext readable after the exposed key and buffer are mutated', () => {
		resetConfig()
		configureStorage({ key: bytes(32, 3) })
		const payload = encrypt('original secret', 'local\u0000token')
		getConfig().key!.fill(9)
		new Uint8Array(getConfig().key!.buffer).fill(8)
		configureStorage({ encryptByDefault: true })
		expect(decrypt(payload, 'local\u0000token')).toBe('original secret')
		expect(decrypt(encrypt('new secret'))).toBe('new secret')
		expect(getConfig().key).toEqual(bytes(32, 3))
	})

	it('fails with a StorageError, not a bare DOMException', () => {
		resetConfig()
		try {
			decrypt('garbage')
			expect.unreachable('decrypt should have thrown')
		} catch (error) {
			expect(isStorageError(error)).toBe(true)
		}
	})
})

describe('isCryptoAvailable', () => {
	it('is true in this environment', () => {
		expect(isCryptoAvailable()).toBe(true)
	})

	it('reports false when getRandomValues is missing, and encrypt throws CRYPTO_UNAVAILABLE', () => {
		resetConfig()
		const original = globalThis.crypto
		// Replacing the whole namespace is the only way to model an old runtime.
		Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true })
		try {
			expect(isCryptoAvailable()).toBe(false)
			expect(() => encrypt('x')).toThrowError(expect.objectContaining({ code: 'CRYPTO_UNAVAILABLE' }))
		} finally {
			Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true, writable: true })
		}
	})
})
