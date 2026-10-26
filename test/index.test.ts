/*
 * @Author: OneWafer
 * @Description: Tests for the public entry point and the shipped drivers
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetConfig } from '../lib/config'
import * as api from '../lib/index'
import { local, session } from '../lib/index'

beforeEach(() => {
	resetConfig()
	local.clearAll()
	session.clearAll()
})

afterEach(() => {
	local.clearAll()
	session.clearAll()
})

describe('public API', () => {
	it('exports the documented surface', () => {
		expect(Object.keys(api).sort()).toEqual(
			[
				'StorageError',
				'configureStorage',
				'createStorage',
				'getConfig',
				'isCryptoAvailable',
				'isStorageError',
				'local',
				'resetConfig',
				'resolveWebStorage',
				'session'
			].sort()
		)
	})

	it('exposes both drivers with the full driver interface', () => {
		for (const driver of [local, session]) {
			expect(typeof driver.get).toBe('function')
			expect(typeof driver.set).toBe('function')
			expect(typeof driver.has).toBe('function')
			expect(typeof driver.remove).toBe('function')
			expect(typeof driver.clear).toBe('function')
			expect(typeof driver.clearAll).toBe('function')
			expect(typeof driver.keys).toBe('function')
			expect(typeof driver.isPersistent).toBe('boolean')
		}
	})
})

describe('local and session drivers', () => {
	it('are in memory under Node, which has no Web Storage', () => {
		expect(local.isPersistent).toBe(false)
		expect(session.isPersistent).toBe(false)
	})

	it('round-trip values independently', () => {
		local.set('k', 'local value')
		session.set('k', 'session value')
		expect(local.get('k')).toBe('local value')
		expect(session.get('k')).toBe('session value')
	})

	it('clear() scopes to the driver', () => {
		local.set('a', 1)
		session.set('a', 2)
		local.clear()
		expect(local.keys()).toEqual([])
		expect(session.keys()).toEqual(['a'])
	})

	it('encrypts and decrypts through the public API', () => {
		local.set('token', { refresh: 'abc' }, { encrypt: true })
		expect(local.get('token')).toEqual({ refresh: 'abc' })
	})

	it('resolveWebStorage returns a lazy accessor that tolerates a missing global', () => {
		expect(api.resolveWebStorage('localStorage')()).toBeNull()
		expect(api.resolveWebStorage('sessionStorage')()).toBeNull()
	})
})
