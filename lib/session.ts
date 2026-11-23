/*
 * @Author: OneWafer
 * @Description: sessionStorage driver
 */
import { createStorage, resolveWebStorage } from './storage.js'

/**
 * Driver backed by `sessionStorage`, falling back to an in-memory store when no
 * usable storage area is available. See {@link StorageDriver} for the full API.
 *
 * Its identity is `session`; ciphertexts require the same authenticated context.
 * This is a module-level singleton. In SSR, create a separate driver per request
 * instead of using its shared in-memory fallback for request-specific data.
 */
export const session = createStorage(resolveWebStorage('sessionStorage'), { id: 'session' })

export type { SetOptions, StorageDriver } from './storage.js'
