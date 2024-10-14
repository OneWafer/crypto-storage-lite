import { AES, enc, mode, pad } from 'crypto-js'

const SECRET_KEY = enc.Utf8.parse('DEIKna7RWJBEGya3'),
	SECRET_IV = enc.Utf8.parse('qaHMVbvWoWRVyJyS')

/**
 * Encryption function
 *
 * @param {string} data Data to be encrypted
 * @return {string} Encrypted data
 */
const encrypt = (data: string): string => {
	const dataHex = enc.Utf8.parse(data),
		encrypted = AES.encrypt(dataHex, SECRET_KEY, { iv: SECRET_IV, mode: mode.CBC, padding: pad.Pkcs7 })

	return encrypted.ciphertext.toString()
}

/**
 * Decryption function
 *
 * @param {string} data Data to be decrypted
 * @returns {string} Decrypted data
 */
const decrypt = (data: string): string => {
	const encryptedHexStr = enc.Hex.parse(data),
		str = enc.Base64.stringify(encryptedHexStr),
		decrypted = AES.decrypt(str, SECRET_KEY, { iv: SECRET_IV, mode: mode.CBC, padding: pad.Pkcs7 })

	return decrypted.toString(enc.Utf8)
}

export { encrypt, decrypt }
