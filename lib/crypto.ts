/*
 * @Author: OneWafer
 * @Description: Synchronous AES-256-GCM built on @noble/ciphers
 */
import { gcm } from '@noble/ciphers/aes.js'
import { getConfig } from './config.js'
import { StorageError } from './error.js'

/** Envelope for an encrypted payload: `<iv>.<ciphertext>`, both base64. */
const SEPARATOR = '.'

const IV_BYTES = 12 // 96-bit nonce, the size AES-GCM is designed for

/**
 * The library's built-in AES-256 key. It ships inside the bundle, so it cannot
 * hide data from anyone who can read this source: it defends against casual
 * inspection of the storage area (devtools, a shared machine, a synced profile
 * dump), not against an attacker who has your code. Pass your own key to
 * `configureStorage({ key })` if you need a real trust boundary, and see the
 * "Security notes" section of the README.
 */
const BUILT_IN_KEY = new Uint8Array([
	0x3d, 0x53, 0xf5, 0x6c, 0x10, 0xf4, 0xf7, 0x7b, 0x42, 0xe4, 0xfb, 0x26, 0x81, 0xd2, 0x55, 0x41, 0x4b, 0x7e, 0xd2,
	0xc1, 0x6f, 0x61, 0xf8, 0x51, 0x73, 0x80, 0xe6, 0xd9, 0x5c, 0xe6, 0xd2, 0xa1
])

const encoder = new TextEncoder()
// `fatal` turns a corrupted plaintext into an error instead of a string full of
// replacement characters.
const decoder = new TextDecoder('utf-8', { fatal: true })

const currentKey = (): Uint8Array => getConfig().key ?? BUILT_IN_KEY

/**
 * True when the runtime exposes `crypto.getRandomValues`, which is the only
 * part of the Web Crypto API this library still needs (for the per-write IV).
 * Unlike `crypto.subtle`, it is available outside secure contexts.
 */
export const isCryptoAvailable = (): boolean => typeof globalThis.crypto?.getRandomValues === 'function'

const randomBytes = (length: number): Uint8Array => {
	if (!isCryptoAvailable()) {
		throw new StorageError(
			'Encryption is unavailable: `crypto.getRandomValues` is missing in this environment.',
			'CRYPTO_UNAVAILABLE'
		)
	}
	return globalThis.crypto.getRandomValues(new Uint8Array(length))
}

const toBase64 = (bytes: Uint8Array): string => {
	let binary = ''
	const chunk = 0x8000
	for (let index = 0; index < bytes.length; index += chunk) {
		binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
	}
	return btoa(binary)
}

const fromBase64 = (value: string): Uint8Array<ArrayBuffer> => {
	let binary: string
	try {
		binary = atob(value)
	} catch (error) {
		throw new StorageError('Encrypted payload is not valid base64', 'PARSE_FAILED', { cause: error })
	}
	const bytes = new Uint8Array(new ArrayBuffer(binary.length))
	for (let index = 0; index < binary.length; index++) {
		bytes[index] = binary.charCodeAt(index)
	}
	return bytes
}

/**
 * Encrypt UTF-8 text.
 *
 * A fresh random IV is generated per call, so identical plaintexts produce
 * different ciphertexts. `context` is authenticated but not encrypted, binding
 * the ciphertext to where it is stored: a payload copied to another key or
 * another storage area (or with tampered content) fails to decrypt.
 *
 * @returns `<iv>.<ciphertext>` in base64
 */
export const encrypt = (plaintext: string, context = ''): string => {
	const iv = randomBytes(IV_BYTES)
	const aad = context ? encoder.encode(context) : undefined
	const sealed = gcm(currentKey(), iv, aad).encrypt(encoder.encode(plaintext))

	return `${toBase64(iv)}${SEPARATOR}${toBase64(sealed)}`
}

/**
 * Decrypt a payload produced by {@link encrypt}. Throws `DECRYPT_FAILED` when
 * the data was modified, moved to another key, or written with a different key
 * or library version.
 */
export const decrypt = (payload: string, context = ''): string => {
	const separatorIndex = payload.indexOf(SEPARATOR)
	if (separatorIndex <= 0 || separatorIndex === payload.length - 1) {
		throw new StorageError('Encrypted payload is malformed', 'PARSE_FAILED')
	}

	const iv = fromBase64(payload.slice(0, separatorIndex))
	if (iv.length !== IV_BYTES) {
		throw new StorageError('Encrypted payload has an unexpected IV length', 'PARSE_FAILED')
	}
	const ciphertext = fromBase64(payload.slice(separatorIndex + 1))

	try {
		const aad = context ? encoder.encode(context) : undefined
		return decoder.decode(gcm(currentKey(), iv, aad).decrypt(ciphertext))
	} catch (error) {
		throw new StorageError(
			'Decryption failed: the stored data has been tampered with, or it was written by an incompatible version of this library or a different key.',
			'DECRYPT_FAILED',
			{ cause: error }
		)
	}
}
