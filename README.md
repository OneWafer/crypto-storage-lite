<!--
 * @Author: OneWafer
 * @Date: 2025-01-09 10:53:45
 * @LastEditors: OneWafer
 * @LastEditTime: 2025-01-09 11:06:49
 * @Description: Do not edit
-->
# crypto-storage-lite

<div>
  <h3 align="center">
    A lightweight and secure browser storage library with built-in encryption support for localStorage and sessionStorage.
  </h3>
</div>

<p align="center">
  <a href="https://www.npmjs.com/package/crypto-storage-lite">
    <img src="https://img.shields.io/npm/dm/crypto-storage-lite.svg" alt="npm downloads" height="18">
  </a>
  <a href="https://www.npmjs.com/package/crypto-storage-lite">
    <img src="https://img.shields.io/npm/v/crypto-storage-lite.svg" alt="npm version" height="18">
  </a>
  <a href="https://github.com/OneWafer/crypto-storage-lite">
    <img src="https://img.shields.io/npm/l/crypto-storage-lite.svg" alt="MIT license" height="18">
  </a>
</p>

## Features

- 🔒 Built-in encryption support
- 🚀 Lightweight and zero dependencies
- 💾 Support for both localStorage and sessionStorage
- 🔄 Type-safe with TypeScript support
- ⏰ Automatic expiration handling

## Install

```
npm install crypto-storage-lite
```

## Usage

Basic Usage:

```js
import { local, session } from "crypto-storage-lite";

// Set a value in the localStorage / sessionStorage
local.set("name", "John Doe");
session.set("name", "John Doe");

// Get a value from the localStorage / sessionStorage
console.log(local.get("name")); // John Doe
console.log(session.get("name")); // John Doe


// Remove a value from the localStorage / sessionStorage
local.remove("name");
session.remove("name");

// Check if a value exists in the localStorage / sessionStorage
console.log(local.has("name")); // false
console.log(session.has("name")); // false

// Clear the localStorage / sessionStorage
local.clear();
session.clear();
```

Encryption and Expiration:
```js
import { local } from "crypto-storage-lite";

// Set a value in the localStorage with encryption
local.set("password", "secretPassword", { encrypt: true, expires: 1000*60*60*24 });

// Get a value from the localStorage with decryption
console.log(local.get("password", { decrypt: true })); // secretPassword
```