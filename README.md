# crypto-storage-lite

<div>
  <h3 align="center">
    A lightweight storage library for the browser with encryption capabilities.
  </h3>
</div>

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

Encryption:
```js
import { local } from "crypto-storage-lite";

// Set a value in the localStorage with encryption
local.set("password", "secretPassword", { encrypt: true });

// Get a value from the localStorage with decryption
console.log(local.get("password", { decrypt: true })); // secretPassword
```

## API

### `local.set(key, value, options)`

Set a value in the localStorage.

- `key` - The key of the value.
- `value` - The value to set.
- `options` - An object with the following properties:
  - `encrypt` - Encrypt the value before setting it in the localStorage.

### `local.get(key, options)`
- `key` - The key of the value.
- `options` - An object with the following properties:
  - `decrypt` - Decrypt the value before returning it.

### `local.remove(key)`
- `key` - The key of the value.

### `local.has(key)`
- `key` - The key of the value.

### `local.clear()`

### `session.set(key, value, options)`
Same as `local.set`.

### `session.get(key, options)`
Same as `local.get`.

### `session.remove(key)`
Same as `local.remove`.

### `session.has(key)`
Same as `local.has`.

### `session.clear()`
