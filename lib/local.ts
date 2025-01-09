/*
 * @Author: OneWafer
 * @Date: 2024-10-11 13:16:46
 * @LastEditors: OneWafer
 * @LastEditTime: 2025-01-09 11:08:37
 * @Description: Local storage utilities with encryption support
 */
import { decrypt, encrypt } from './crypto'

/**
 * Storage configuration options
 */
interface StorageOptions {
	encrypt?: boolean
	decrypt?: boolean
	expires?: number // Expiration time in milliseconds
}

/**
 * Storage value wrapper with expiration
 */
interface StorageWrapper {
	value: any
	expires?: number // Expiration timestamp
}

/**
 * Set a key-value pair in localStorage with optional encryption and expiration
 * @param key The key name
 * @param value The value to store
 * @param options Configuration options
 * @param options.encrypt Whether to encrypt, defaults to false
 * @param options.expires Expiration time in milliseconds
 */
const set = (key: string, value: any, options?: StorageOptions): void => {
	try {
		const wrapper: StorageWrapper = {
			value,
			expires: options?.expires ? Date.now() + options.expires : undefined
		}
		const valueStr = JSON.stringify(wrapper)
		const data = options?.encrypt ? encrypt(valueStr) : valueStr
		localStorage.setItem(key, data)
	} catch (error) {
		throw new Error(`Storage failed: ${error}`)
	}
}

/**
 * Get a value from localStorage with optional decryption
 * @param key The key name
 * @param options Configuration options
 * @param options.decrypt Whether to decrypt, defaults to false
 * @returns The parsed value, or null if parsing fails or expired
 */
const get = <T = any>(key: string, options?: StorageOptions): T | null => {
	try {
		const value = localStorage.getItem(key)
		if (!value) return null

		const data = options?.decrypt ? decrypt(value) : value
		const wrapper = JSON.parse(data) as StorageWrapper

		// Check if expired
		if (wrapper.expires && wrapper.expires < Date.now()) {
			localStorage.removeItem(key)
			return null
		}

		return wrapper.value as T
	} catch {
		return null
	}
}

/**
 * Check if a key exists in localStorage and not expired
 * @param key The key to check
 * @returns True if the key exists and not expired, false otherwise
 */
const has = (key: string): boolean => {
	const value = localStorage.getItem(key)
	if (!value) return false

	try {
		const wrapper = JSON.parse(value) as StorageWrapper
		if (wrapper.expires && wrapper.expires < Date.now()) {
			localStorage.removeItem(key)
			return false
		}
		return true
	} catch {
		return false
	}
}

/**
 * Remove a key from localStorage
 * @param key The key name
 */
const remove = (key: string): void => localStorage.removeItem(key)

/**
 * Clear all data from localStorage
 */
const clear = (): void => localStorage.clear()

export { set, get, has, remove, clear }
