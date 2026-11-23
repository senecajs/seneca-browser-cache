/* The store in front of a real remote. The bundle's `browser` client
 * transport posts each `aim:*` message, with the global fetch of Node.js,
 * to a small node:http backend on a free port of 127.0.0.1. The backend
 * answers in the JSON of Seneca's transport utilities: the message
 * arrives with `meta$`, and the reply carries `meta$`, with
 * `meta$.error` set for an error (HTTP status 500, as
 * @seneca/gateway-express sends one). */

const { test, before, after } = require('node:test')
const assert = require('node:assert')
const Http = require('node:http')

const { Seneca } = require('./load-seneca.js')

const BrowserStore = require('../browser-store.js')

const calls = { list: 0, save: 0, broken: 0 }
let server
let base

function backend(msg) {
  if ('item' === msg.list) {
    calls.list++
    return { ok: true, list: [{ id: 't1', title: 'A' }], call: calls.list }
  }
  if ('broken' === msg.list) {
    calls.broken++
    return { error: { code: 'list_failed', message: 'list failed' } }
  }
  if ('item' === msg.save) {
    calls.save++
    if (msg.item && msg.item.fail) {
      return { error: { code: 'save_failed', message: 'save failed' } }
    }
    return { ok: true, item: Object.assign({ id: 'srv' + calls.save }, msg.item) }
  }
  return { error: { code: 'not_found', message: 'not found' } }
}

before(async function () {
  server = Http.createServer(function (req, res) {
    let body = ''
    req.on('data', function (chunk) {
      body += chunk
    })
    req.on('end', function () {
      const msg = JSON.parse(body)
      const meta = msg.meta$ || {}
      delete msg.meta$

      const out = backend(msg)
      const reply = out.error
        ? Object.assign({}, out.error, { meta$: { id: meta.id, error: true } })
        : Object.assign({}, out, { meta$: { id: meta.id } })

      res.writeHead(out.error ? 500 : 200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(reply))
    })
  })

  await new Promise(function (resolve, reject) {
    server.listen(0, '127.0.0.1', resolve).on('error', reject)
  })
  base = 'http://127.0.0.1:' + server.address().port
})

after(async function () {
  if (server) {
    server.closeAllConnections()
    await new Promise(function (resolve) {
      server.close(resolve)
    })
  }
})

// The store is registered AFTER `.client(...)`, as the README says.
async function make() {
  const seneca = Seneca({
    legacy: false,
    log: 'silent',
    timeout: 2222,
    plugin: { browser: { endpoint: base + '/seneca' } },
  }).client({ type: 'browser', pin: 'aim:*' })
  seneca.use(BrowserStore, { pin: 'aim:*' })
  await seneca.ready()
  return seneca
}

function act(seneca, pattern, params) {
  return new Promise(function (resolve) {
    seneca.act(pattern, params || {}, function (err, out) {
      resolve({ err: err, out: out })
    })
  })
}

test('remote read: cached, so the second identical read never reaches the server', async function () {
  const seneca = await make()
  const before = calls.list

  const a = await seneca.post('aim:todo,list:item')
  const b = await seneca.post('aim:todo,list:item')

  assert.equal(calls.list - before, 1, 'server hit once for two identical reads')
  assert.deepEqual(b.list, a.list)
  assert.equal(seneca.export('browser-store/api').stats().hits, 1)

  await seneca.close()
})

test('remote write error: the caller gets it unchanged, the group heals, the bus stays usable', async function () {
  const seneca = await make()
  const api = seneca.export('browser-store/api')
  const before = calls.list

  await seneca.post('aim:todo,list:item') // cached

  const res = await act(seneca, 'aim:todo,save:item', { item: { title: 'bad', fail: true } })
  assert.ok(res.err, 'the remote error reaches the caller')
  assert.equal(res.err.code, 'save_failed')

  await assert.rejects(seneca.post('aim:todo,save:item', { item: { title: 'bad', fail: true } }), function (err) {
    assert.equal(err.code, 'save_failed')
    return true
  })

  assert.ok(api.stats().invalidations >= 1, 'the group was invalidated on the error')

  // Healed: the next read goes to the server again, and works.
  const out = await seneca.post('aim:todo,list:item')
  assert.equal(calls.list - before, 2)
  assert.equal(out.list[0].id, 't1')

  // A good write still works after the errors.
  const saved = await seneca.post('aim:todo,save:item', { item: { title: 'good' } })
  assert.ok(saved.ok)

  await seneca.close()
})

test('remote read error: passed through and not cached', async function () {
  const seneca = await make()
  const before = calls.broken

  for (let i = 0; i < 2; i++) {
    await assert.rejects(seneca.post('aim:todo,list:broken'), function (err) {
      assert.equal(err.code, 'list_failed')
      return true
    })
  }

  assert.equal(calls.broken - before, 2, 'a failed read is not served from the cache')
  assert.equal(seneca.export('browser-store/api').entries(), 0)

  await seneca.close()
})
