import { describe, expect, it } from 'vitest'
import { ConnectionClosedError, OllupiClient, RpcError, type Transport, type TransportEvents } from './index'

/** The far side of an in-memory transport, playing the gateway. */
function gateway(onMessage: (m: any, reply: (m: object) => void) => void = () => {}) {
  let events: TransportEvents | undefined
  const sent: any[] = []
  const reply = (m: object) => events?.message(JSON.stringify({ jsonrpc: '2.0', ...m }))
  const transport: Transport = {
    send: (text) => {
      const m = JSON.parse(text)
      sent.push(m)
      if (m.method === 'initialize') reply({ id: m.id, result: { serverInfo: { name: 'ollupi', version: '1' } } })
      else onMessage(m, reply)
    },
    close: () => events?.close('closed'),
    listen: (e) => (events = e),
  }
  return { transport, sent, reply, drop: (reason: string) => events?.close(reason) }
}

const info = { name: 'test', version: '0' }
const settle = () => new Promise((r) => setTimeout(r, 0))

describe('OllupiClient', () => {
  it('initializes, then sends the initialized notification', async () => {
    const gw = gateway()
    const client = await OllupiClient.over(gw.transport, info)
    expect(client.serverInfo.name).toBe('ollupi')
    expect(gw.sent.map((m) => [m.method, 'id' in m])).toEqual([
      ['initialize', true],
      ['initialized', false],
    ])
  })

  it('maps error responses to RpcError with the code', async () => {
    const gw = gateway((m, reply) => reply({ id: m.id, error: { code: -32004, message: 'not found' } }))
    const client = await OllupiClient.over(gw.transport, info)
    const err = await client.call('thread/read', { threadId: 'x' }).catch((e) => e)
    expect(err).toBeInstanceOf(RpcError)
    expect(err.code).toBe(-32004)
  })

  it('delivers notifications until unsubscribed', async () => {
    const gw = gateway()
    const client = await OllupiClient.over(gw.transport, info)
    const seen: string[] = []
    const off = client.on('item/agentMessage/delta', (p) => seen.push(p.delta))
    const delta = (d: string) => ({ method: 'item/agentMessage/delta', params: { threadId: 't', turnId: 'u', itemId: 'i', delta: d } })
    gw.reply(delta('he'))
    off()
    gw.reply(delta('llo'))
    expect(seen).toEqual(['he'])
  })

  it('answers a server request with the handler result under its id', async () => {
    const gw = gateway()
    const client = await OllupiClient.over(gw.transport, info)
    client.handle('item/toolCall/requestApproval', async () => ({ decision: 'accept' }))
    gw.reply({ id: 'srv-7', method: 'item/toolCall/requestApproval', params: {} })
    await settle()
    expect(gw.sent.at(-1)).toEqual({ jsonrpc: '2.0', id: 'srv-7', result: { decision: 'accept' } })
  })

  it('refuses server requests nobody handles', async () => {
    const gw = gateway()
    await OllupiClient.over(gw.transport, info)
    gw.reply({ id: 3, method: 'item/tool/requestUserInput', params: {} })
    await settle()
    expect(gw.sent.at(-1).error.code).toBe(-32601)
  })

  it('rejects calls in flight when the connection drops', async () => {
    const gw = gateway()
    const client = await OllupiClient.over(gw.transport, info)
    const reasons: string[] = []
    client.onClose((r) => reasons.push(r))
    const pending = client.call('model/list', {})
    gw.drop('gone')
    await expect(pending).rejects.toBeInstanceOf(ConnectionClosedError)
    expect(reasons).toEqual(['gone'])
    await expect(client.call('tool/list', {})).rejects.toBeInstanceOf(ConnectionClosedError)
  })
})
