import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import type EventEmitter from 'node:events'
import { randomUUID } from 'node:crypto'
import { WebSocketServer } from 'ws'
import { type ServerType } from '@hono/node-server'
import { DeferredPromise } from '@open-draft/deferred-promise'
import {
  type TestHttpServerProtocol,
  kServer,
  getServerUrl,
  kServers,
  type TestHttpServer,
  kEmitter,
  toRelativePathname,
} from './http.js'

function buildWebSocketApi(
  protocol: TestHttpServerProtocol,
  server: ServerType,
  pathname: string,
) {
  const baseUrl = new URL(
    toRelativePathname(pathname),
    getServerUrl(protocol, server),
  )
  // Always set the protocol to the WebSocket protocol
  // to save the upgrade roundtrip on requests.
  baseUrl.protocol = baseUrl.protocol.replace('http', 'ws')

  return {
    url() {
      return baseUrl
    },
  }
}

export interface TestWebSocketServerOptions {
  server: TestHttpServer
  pathname?: string
}

export function createWebSocketMiddleware(options: TestWebSocketServerOptions) {
  const emitter: EventEmitter = Reflect.get(options.server, kEmitter)
  const pathname = options.pathname ?? `/ws/${randomUUID()}`

  const wss = new WebSocketServer({
    noServer: true,
    path: pathname,
  })

  const handleUpgrade = (
    request: IncomingMessage,
    socket: Socket,
    head: Buffer,
  ) => {
    if (request.url !== pathname) {
      return
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request)
    })
  }

  const subscriptions: Array<Function> = []

  const addUpgradeListener = (server: ServerType) => {
    server.on('upgrade', handleUpgrade)

    // Store the removal of the event listeners so it can be replayed
    // during the cleanup without having to reference the `server` again.
    subscriptions.push(() => server.removeListener('upgrade', handleUpgrade))
  }

  // First, see if the test server already has server instances running.
  // E.g. when calling this middleware inside of a test.
  const servers = Reflect.get(options.server, kServers) as Array<ServerType>
  servers.forEach((server) => {
    addUpgradeListener(server)
  })

  // Add a listener to whenever the test server starts listening.
  // This is handy when adding this middleware to a test server in the setup phase.
  emitter.on('listen', (server: ServerType) => {
    addUpgradeListener(server)
  })

  return {
    async [Symbol.asyncDispose]() {
      await this.close()
    },

    on: wss.on.bind(wss),
    once: wss.once.bind(wss),
    off: wss.off.bind(wss),

    get ws() {
      const server: ServerType = Reflect.get(options.server.http, kServer)
      return buildWebSocketApi('http', server, pathname)
    },

    get wss() {
      const server: ServerType = Reflect.get(options.server.https, kServer)
      return buildWebSocketApi('https', server, pathname)
    },

    async close() {
      let effect
      while ((effect = subscriptions.pop())) {
        effect()
      }

      if (wss.clients.size === 0) {
        return
      }

      const pendingClientClosures: Array<Promise<void>> = []

      wss.clients.forEach((client) => {
        client.close()
        const clientClosedPromise = new DeferredPromise<void>()
        pendingClientClosures.push(clientClosedPromise)
        client.once('close', clientClosedPromise.resolve)
      })

      await Promise.all(pendingClientClosures)

      /**
       * @note I don't think `wss.close()` is necessary since we want to
       * keep the actual HTTP server running even if the WebSocket middleware is disposed of.
       */
    },
  }
}
