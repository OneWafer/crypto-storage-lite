/*
 * @Author: OneWafer
 * @Description: Tests for the error helpers
 */
import { describe, expect, it } from 'vitest'
import { isBlockedError, isQuotaError, isStorageError, StorageError } from '../lib/error'

describe('StorageError', () => {
	it('carries name, code and cause', () => {
		const cause = new Error('root')
		const error = new StorageError('message', 'PARSE_FAILED', { cause })
		expect(error).toBeInstanceOf(Error)
		expect(error.name).toBe('StorageError')
		expect(error.code).toBe('PARSE_FAILED')
		expect(error.message).toBe('message')
		expect(error.cause).toBe(cause)
	})

	it('has no cause property when none is given', () => {
		expect('cause' in new StorageError('m', 'WRITE_FAILED')).toBe(false)
	})
})

describe('isStorageError', () => {
	it('accepts a StorageError', () => {
		expect(isStorageError(new StorageError('m', 'READ_FAILED'))).toBe(true)
	})

	it('accepts a look-alike from another copy of the library', () => {
		const foreign = new Error('m')
		foreign.name = 'StorageError'
		Object.assign(foreign, { code: 'DECRYPT_FAILED' })
		expect(isStorageError(foreign)).toBe(true)
	})

	it('rejects unrelated values', () => {
		for (const value of [null, undefined, 'x', 42, {}, new Error('x'), { name: 'StorageError' }]) {
			expect(isStorageError(value)).toBe(false)
		}
	})
})

describe('isQuotaError', () => {
	const named = (name: string) => Object.assign(new Error(name), { name })

	it('matches the quota error names used by browsers', () => {
		expect(isQuotaError(named('QuotaExceededError'))).toBe(true)
		expect(isQuotaError(named('NS_ERROR_DOM_QUOTA_REACHED'))).toBe(true)
	})

	it('matches the legacy numeric codes', () => {
		expect(isQuotaError(Object.assign(new Error('x'), { code: 22 }))).toBe(true)
		expect(isQuotaError(Object.assign(new Error('x'), { code: 1014 }))).toBe(true)
	})

	it('rejects other errors', () => {
		expect(isQuotaError(named('SecurityError'))).toBe(false)
		expect(isQuotaError(null)).toBe(false)
		expect(isQuotaError('QuotaExceededError')).toBe(false)
	})
})

describe('isBlockedError', () => {
	const named = (name: string) => Object.assign(new Error(name), { name })

	it('matches blocked-storage errors', () => {
		expect(isBlockedError(named('SecurityError'))).toBe(true)
		expect(isBlockedError(named('InvalidAccessError'))).toBe(true)
		expect(isBlockedError(named('InvalidStateError'))).toBe(true)
	})

	it('rejects a quota error', () => {
		expect(isBlockedError(named('QuotaExceededError'))).toBe(false)
	})
})
