import { decrypt, encrypt } from './crypto'

/**
 * Set a key-value pair in localStorage, supporting optional encryption.
 *
 * @param key The name of the key
 * @param value The value to be stored
 * @param options Configuration options, optional
 * @param options.encrypt Whether to encrypt, defaults to false
 */
const set = (key: string, value: any, options?: { encrypt?: boolean }) => {
	try {
		const valueStr = JSON.stringify(value),
			data = options?.encrypt ? encrypt(valueStr) : valueStr
		localStorage.setItem(key, data)
	} catch (error) {
		throw new Error(`'localStorage.setItem' error: ${error}`)
	}
}

/**
 * Retrieve the value of a specified key from localStorage, and decrypt it based on options.
 *
 * @param key The name of the key
 * @param options Configuration options, optional
 * @param options.decrypt Whether to decrypt, defaults to false
 *
 * @returns {any} The parsed value, or null if parsing fails
 */
const get = (key: string, options?: { decrypt?: boolean }): any => {
	try {
		const value = localStorage.getItem(key),
			data = value && options?.decrypt ? decrypt(value) : value
		return JSON.parse(data as string)
	} catch {
		return null
	}
}

/**
 * Checks if a specified key exists in localStorage.
 *
 * @param key The key to be checked.
 * @returns {boolean} Returns true if the specified key exists in localStorage; otherwise, returns false.
 */
const has = (key: string): boolean => localStorage.getItem(key) !== null

/**
 * Removes the item with the specified key from localStorage.
 *
 * @param key The key name.
 */
const remove = (key: string) => localStorage.removeItem(key)

/**
 * Clears all data from localStorage.
 */
const clear = () => localStorage.clear()

export { set, get, has, remove, clear }
