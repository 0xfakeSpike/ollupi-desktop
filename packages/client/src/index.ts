// @ollupi/client: talks to an ollupi gateway. Framework-free; runs wherever
// a WebSocket does (renderer, Node, tests).
export { OllupiClient, type Inspector } from './client'
export { RpcError, ConnectionClosedError, errorMessage } from './peer'
export { type Transport, type TransportEvents } from './transport'
