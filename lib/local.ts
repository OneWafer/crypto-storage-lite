/*
 * @Author: OneWafer
 * @Description: localStorage driver
 */
import { createStorage, resolveWebStorage } from './storage.js'

/**
 * Driver backed by `localStorage`, falling back to an in-memory store when no
 * usable storage area is available. See {@link StorageDriver} for the full API.
 *
 * Its identity is `local`; ciphertexts require the same authenticated context.
 * This is a module-level singleton. In SSR, create a separate driver per request
 * instead of using its shared in-memory fallback for request-specific data.
 */
export const local = createStorage(resolveWebStorage('localStorage'), { id: 'local' })

export type { SetOptions, StorageDriver } from './storage.js'
