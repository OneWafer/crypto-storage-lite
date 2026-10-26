/*
 * @Author: OneWafer
 * @Description: sessionStorage driver
 */
import { createStorage, resolveWebStorage } from './storage.js'

/**
 * Driver backed by `sessionStorage`, falling back to an in-memory store when no
 * usable storage area is available. See {@link StorageDriver} for the full API.
 *
 * Its identity is `session`, so a payload copied into `localStorage` (or into a
 * namespaced driver) under the same key will not decrypt.
 */
export const session = createStorage(resolveWebStorage('sessionStorage'), { id: 'session' })

export type { SetOptions, StorageDriver } from './storage.js'
