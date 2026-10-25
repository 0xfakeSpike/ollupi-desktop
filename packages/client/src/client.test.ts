import { describe, expect, it } from 'vitest'
import { ConnectionClosedError, OllupiClient, RpcError, type Transport, type TransportEvents } from './index'

/** A fake gateway on the far side of an in-memory transport. */
function fakeGateway(onMessage: (m: any, reply: (m: object) => void) => void) {
  let events: TransportEvents | undefined
  const sent: any[] = []
  const reply = (m: object) => events?.message(JSON.stringify({ jsonrpc: '2.0', ...m }))
  const transport: Transport = {
    send: (text) => {
      const m = JSON.parse(text)
      sent.push(m)
      onMessage(m, reply)
    },
    close: () => events?.close('closed'),
    listen: (e) => (events = e),
  }
  return { transport, sent, reply, drop: (reason: string) => events?.close(reason) }
}

const info = { name: 'test', version: '0' }

function initializing(handler: (m: any, reply: (m: object) => void) => void = () => {}) {
  return fakeGateway((m, reply) => {
    if (m.method === 'initialize') reply({ id: m.id, result: { serverInfo: { name: 'ollupi', version: '1' } } })
    else handler(m, reply)
  })
}

describe('OllupiClient', () => {
  it('initializes, then sends the initialized notification', async () => {
    const gw = initializing()
    const client = await OllupiClient.over(gw.transport, info)
    expect(client.serverInfo.name).toBe('ollupi')
    expect(gw.sent.map((m) => m.method)).toEqual(['initialize', 'initialized'])
    expect(gw.sent[1].id).toBeUndefined()
  })

  it('maps error responses to RpcError', async () => {
    const gw = initializing((m, reply) => reply({ id: m.id, error: { code: -32004, message: 'not found' } }))
    const client = await OllupiClient.over(gw.transport, info)
    await expect(client.call('thread/read', { threadId: 'x' })).rejects.toMatchObject({
      constructor: RpcError,
      code: -32004,
    })
  })

  it('dispatches notifications to listeners until unsubscribed', async () => {
    const gw = initializing()
    const client = await OllupiClient.over(gw.transport, info)
    const seen: string[] = []
    const off = client.on('item/agentMessage/delta', (p) => seen.push(p.delta))
    gw.reply({ method: 'item/agentMessage/delta', params: { threadId: 't', turnId: 'u', itemId: 'i', delta: 'he' } })
    off()
    gw.reply({ method: 'item/agentMessage/delta', params: { threadId: 't', turnId: 'u', itemId: 'i', delta: 'llo' } })
    expect(seen).toEqual(['he'])
  })

  it('answers server requests with the handler result, keeping the id', async () => {
    const gw = initializing()
    const client = await OllupiClient.over(gw.transport, info)
    client.handle('item/toolCall/requestApproval', async () => ({ decision: 'accept' }))
    gw.reply({ id: 'srv-7', method: 'item/toolCall/requestApproval', params: {} })
    await Promise.resolve()
    await Promise.resolve()
    expect(gw.sent.at(-1)).toEqual({ jsonrpc: '2.0', id: 'srv-7', result: { decision: 'accept' } })
  })

  it('refuses server requests nobody handles', async () => {
    const gw = initializing()
    await OllupiClient.over(gw.transport, info)
    gw.reply({ id: 3, method: 'item/tool/requestUserInput', params: {} })
    await Promise.resolve()
    expect(gw.sent.at(-1).error.code).toBe(-32601)
  })

  it('rejects in-flight calls when the connection drops', async () => {
    const gw = initializing()
    const client = await OllupiClient.over(gw.transport, info)
    const reasons: string[] = []
    client.onClose((r) => reasons.push(r))
    const call = client.call('model/list', {})
    gw.drop('gone')
    await expect(call).rejects.toBeInstanceOf(ConnectionClosedError)
    expect(reasons).toEqual(['gone'])
    expect(client.isClosed).toBe(true)
  })
})
