// @ollupi/client: talks to an ollupi gateway. Framework-free; runs wherever
// a WebSocket does (renderer, Node, tests).
export { OllupiClient, type ClientInfo, type ConnectOptions } from './client'
export { RpcPeer, RpcError, ConnectionClosedError, errorMessage, type PeerHandlers } from './peer'
export {
  connectWebSocket,
  type Transport,
  type TransportEvents,
  type WebSocketFactory,
  type WebSocketLike,
} from './transport'
