/*
 * @Author: OneWafer
 * @Description: Demo page for the library
 */
import { isCryptoAvailable, local, session } from '../lib/index'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <h1>Crypto Storage Lite</h1>
  <p>Persistent storage: ${local.isPersistent}</p>
  <p>Random source available: ${isCryptoAvailable()}</p>
`

// Everything is synchronous — no async/await needed.
local.set('plain', { hello: 'world' })
local.set('token', 'super-secret', { encrypt: true })
session.set('tab', 'only-this-tab', { encrypt: true })

console.log('plain   :', local.get('plain'))
console.log('token   :', local.get('token'))
console.log('keys    :', local.keys())
console.log('session :', session.get('tab'))

// Typed reads: `validate` turns a mismatch into a normal `onError` failure
// instead of handing back a value of the wrong type.
const token = local.get('token', (value): value is string => typeof value === 'string')
console.log('typed   :', token?.toUpperCase())

// The raw stored form is tagged, so it is obvious what was encrypted.
console.log('raw     :', localStorage.getItem('token')?.slice(0, 5))
