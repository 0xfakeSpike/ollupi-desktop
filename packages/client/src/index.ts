// @ollupi/client: talks to an ollupi gateway. Framework-free; runs wherever a
// WebSocket does (renderer, Node, tests).
export { OllupiClient, type ConnectOptions } from './client'
export { RpcPeer, RpcError, ConnectionClosedError, errorMessage } from './rpc'
export {
  connectWebSocket,
  type Transport,
  type TransportEvents,
  type WebSocketFactory,
  type WebSocketLike,
} from './transport'
