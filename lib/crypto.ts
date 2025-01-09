/*
 * @Author: OneWafer
 * @Date: 2024-10-09 18:05:18
 * @LastEditors: OneWafer
 * @LastEditTime: 2025-01-09 09:36:39
 * @Description: Crypto utilities for encryption and decryption
 */
import { AES, enc, mode, pad } from 'crypto-js'

/**
 * Crypto configuration
 */
const CRYPTO_CONFIG = {
	key: enc.Utf8.parse('DEIKna7RWJBEGya3'),
	iv: enc.Utf8.parse('qaHMVbvWoWRVyJyS'),
	mode: mode.CBC,
	padding: pad.Pkcs7
}

/**
 * AES encryption
 * @param {string} data Data to be encrypted
 * @return {string} Encrypted data
 */
const encrypt = (data: string): string => {
	const dataHex = enc.Utf8.parse(data)
	const encrypted = AES.encrypt(dataHex, CRYPTO_CONFIG.key, {
		iv: CRYPTO_CONFIG.iv,
		mode: CRYPTO_CONFIG.mode,
		padding: CRYPTO_CONFIG.padding
	})
	return encrypted.ciphertext.toString()
}

/**
 * AES decryption
 * @param {string} data Data to be decrypted
 * @returns {string} Decrypted data
 */
const decrypt = (data: string): string => {
	const encryptedHexStr = enc.Hex.parse(data)
	const str = enc.Base64.stringify(encryptedHexStr)
	const decrypted = AES.decrypt(str, CRYPTO_CONFIG.key, {
		iv: CRYPTO_CONFIG.iv,
		mode: CRYPTO_CONFIG.mode,
		padding: CRYPTO_CONFIG.padding
	})
	return decrypted.toString(enc.Utf8)
}

export { encrypt, decrypt }
