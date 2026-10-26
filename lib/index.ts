/*
 * @Author: OneWafer
 * @Description: Public entry point
 */

export type { ErrorHandler, ErrorMode, OnError, ResolvedConfig, StorageConfig } from './config.js'
export { configureStorage, getConfig, resetConfig } from './config.js'
export { isCryptoAvailable } from './crypto.js'
export type { StorageErrorCode } from './error.js'
export { isStorageError, StorageError } from './error.js'
export { local } from './local.js'
export { session } from './session.js'
export type { CreateStorageOptions, SetOptions, StorageDriver } from './storage.js'
export { createStorage, resolveWebStorage } from './storage.js'
