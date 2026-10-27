// A minimal MCP server over stdio with one tool, echo, so a real ollupi
// backend can be given an MCP server without installing one
// (record-session.mjs, manual UI testing). Messages are newline-delimited
// JSON-RPC on stdin and stdout.
//
//   node scripts/mock-mcp.mjs
import { createInterface } from 'node:readline'

const reply = (id, result) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
const fail = (id, code, message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`)

createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line)
  if (m.id === undefined) return // notifications: initialized, cancelled
  switch (m.method) {
    case 'initialize':
      return reply(m.id, { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'mock-mcp', version: '0.1' } })
    case 'ping':
      return reply(m.id, {})
    case 'tools/list':
      return reply(m.id, {
        tools: [
          {
            name: 'echo',
            description: 'Echoes the text back.',
            inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
            annotations: { readOnlyHint: true },
          },
        ],
      })
    case 'tools/call':
      return reply(m.id, { content: [{ type: 'text', text: String(m.params.arguments?.text ?? '') }] })
    default:
      return fail(m.id, -32601, `method not found: ${m.method}`)
  }
})
