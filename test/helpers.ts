/*
 * @Author: OneWafer
 * @Description: Shared test helpers — in-memory storage areas and failure injection
 */

/** A `Storage` backed by a `Map`, with direct access to the raw entries. */
export interface FakeArea {
	area: Storage
	raw: Map<string, string>
}

export const createFakeArea = (initial: Record<string, string> = {}): FakeArea => {
	const raw = new Map(Object.entries(initial))
	const area: Storage = {
		get length() {
			return raw.size
		},
		key: index => [...raw.keys()][index] ?? null,
		getItem: key => raw.get(key) ?? null,
		setItem: (key, value) => {
			raw.set(key, value)
		},
		removeItem: key => {
			raw.delete(key)
		},
		clear: () => {
			raw.clear()
		}
	}
	return { area, raw }
}

/** Create a DOM-ish error with a specific `name`, which is all the library inspects. */
export const namedError = (name: string, message = name): Error => {
	const error = new Error(message)
	error.name = name
	return error
}

export interface FailableArea {
	area: Storage
	raw: Map<string, string>
	/** Make the given operations throw from now on. */
	fail: (ops: Array<'getItem' | 'setItem' | 'removeItem' | 'clear' | 'key'>, error: Error) => void
}

/**
 * A storage area whose operations can be made to throw on demand, used to model
 * blocked storage (`SecurityError`), a full quota and revoked access.
 */
export const createFailableArea = (initial: Record<string, string> = {}): FailableArea => {
	const { raw } = createFakeArea(initial)
	const failing = new Map<string, () => Error>()

	const guard = <T>(name: string, operation: () => T): T => {
		const make = failing.get(name)
		if (make) throw make()
		return operation()
	}

	const area: Storage = {
		get length() {
			return raw.size
		},
		key: index => guard('key', () => [...raw.keys()][index] ?? null),
		getItem: key => guard('getItem', () => raw.get(key) ?? null),
		setItem: (key, value) =>
			guard('setItem', () => {
				raw.set(key, value)
			}),
		removeItem: key =>
			guard('removeItem', () => {
				raw.delete(key)
			}),
		clear: () =>
			guard('clear', () => {
				raw.clear()
			})
	}

	return {
		area,
		raw,
		// One error instance is reused, which is what a browser does for repeated
		// DOMException-style failures.
		fail: (ops, error) => {
			for (const op of ops) failing.set(op, () => error)
		}
	}
}
