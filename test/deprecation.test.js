/* Seneca 4 reports a deprecated call with process.emitWarning, once per
 * process. Inside the @seneca/browser bundle the notice goes to
 * console.warn, as `[SENECA_DEP_...] DeprecationWarning: ...`. This file
 * runs in its own process (node --test runs each file in a separate
 * process), so no other test has used up a notice before it. */

const { test } = require('node:test')
const assert = require('node:assert')

const { Seneca } = require('./load-seneca.js')

const BrowserStore = require('../browser-store.js')

function captureWarn() {
  const warns = []
  const orig = console.warn
  console.warn = function () {
    warns.push(Array.prototype.slice.call(arguments).join(' '))
  }
  return {
    warns: warns,
    restore: function () {
      console.warn = orig
    },
  }
}

async function make() {
  const seneca = Seneca({ legacy: false, log: 'silent' })
  const calls = { list: 0 }
  seneca.add('aim:todo,list:item', function (m, r) {
    calls.list++
    r(null, { ok: true, list: [{ id: 't1', title: 'A' }] })
  })
  seneca.add('aim:todo,save:item', function (m, r) {
    r(null, { ok: true, item: Object.assign({ id: 'srv1' }, m.item) })
  })
  seneca.use(BrowserStore, { pin: 'aim:*' })
  await seneca.ready()
  return { seneca, calls }
}

test('the store causes no deprecation notice', async function () {
  const cap = captureWarn()
  try {
    const { seneca } = await make()
    await seneca.post('aim:todo,list:item')
    await seneca.post('aim:todo,list:item')
    await seneca.post('aim:todo,save:item', { item: { title: 'B' } })
    await seneca.post('sys:browser-store,get:state')
    await seneca.post('sys:browser-store,clear:store')
    await seneca.close()
  }
  finally {
    cap.restore()
  }
  assert.deepEqual(
    cap.warns.filter(function (w) {
      return w.includes('SENECA_DEP_')
    }),
    [],
  )
})

test('a deprecated call inside the bundle is not fatal to the store', async function () {
  const { seneca, calls } = await make()
  await seneca.post('aim:todo,list:item') // cached

  const cap = captureWarn()
  let out
  try {
    out = await new Promise(function (resolve, reject) {
      // act_if is deprecated (SENECA_DEP_ACT_IF).
      seneca.act_if(true, 'aim:todo,list:item', function (err, out) {
        return err ? reject(err) : resolve(out)
      })
    })
  }
  finally {
    cap.restore()
  }

  assert.equal(out.list[0].id, 't1')
  assert.equal(calls.list, 1, 'served from the cache')
  assert.equal(cap.warns.length, 1)
  assert.match(cap.warns[0], /^\[SENECA_DEP_ACT_IF\] DeprecationWarning: /)

  // The store keeps working.
  await seneca.post('aim:todo,save:item', { item: { title: 'C' } })
  assert.equal(seneca.export('browser-store/api').entries(), 1)

  await seneca.close()
})
