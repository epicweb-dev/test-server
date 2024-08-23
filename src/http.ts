import fs from 'node:fs'
import https from 'node:https'
import type { Socket } from 'node:net'
import EventEmitter from 'node:events'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve, type ServerType } from '@hono/node-server'
import { DeferredPromise } from '@open-draft/deferred-promise'

export type TestHttpServerProtocol = 'http' | 'https'
type ServeOptions = Parameters<typeof serve>[0]

export interface TestHttpServer {
  [Symbol.asyncDispose](): Promise<void>

  close: () => Promise<void>
  http: TestHttpServerApi
  https: TestHttpServerApi
}

export interface TestHttpServerOptions {
  protocols?: Array<TestHttpServerProtocol>
  hostname?: string
  defineRoutes?: (router: Hono) => void
}

export interface TestHttpServerApi {
  url: UrlBuilderFunction
}

interface UrlBuilderFunction {
  (pathname?: string): URL
}

export const DEFAULT_PROTOCOLS: Array<TestHttpServerProtocol> = ['http']

/**
 * @note Store the current file's URL in a separate variable
 * so that `URL` instances don't get resolves against the "http://"
 * scheme (as Vite does normally in the browser) in JSDOM.
 * This will force urls to use the "file:// scheme.
 */
const BASE_URL = import.meta.url

const SSL_CERT_PATH = new URL('../cert.pem', BASE_URL)
const SSL_KEY_PATH = new URL('../key.pem', BASE_URL)

export const kApp = Symbol('kApp')
export const kServer = Symbol('kServer')
export const kServers = Symbol('kServers')
export const kEmitter = Symbol('kEmitter')

export async function createTestHttpServer(
  options?: TestHttpServerOptions,
): Promise<TestHttpServer> {
  const protocols = Array.from(
    new Set(
      typeof options === 'object' && Array.isArray(options.protocols)
        ? options.protocols
        : DEFAULT_PROTOCOLS,
    ),
  )
  const sockets = new Set<Socket>()
  const emitter = new EventEmitter()

  const rootRouter = new Hono()
  rootRouter.get('/', () => {
    return new Response('Test server is listening')
  })

  if (
    typeof options === 'object' &&
    typeof options.defineRoutes === 'function'
  ) {
    options.defineRoutes(rootRouter)
  }

  /**
   * @note Apply the default CORS middleware last so `defineRoutes`
   * could override it. Request handlers are sensitive to order.
   */
  rootRouter.use(cors())

  const app = new Hono(rootRouter)
  const serveOptions = {
    fetch: app.fetch,
    hostname: options?.hostname || '127.0.0.1',
    port: 0,
  } satisfies ServeOptions

  const servers = new Map<TestHttpServerProtocol, ServerType>()
  const serverInits = new Map<TestHttpServerProtocol, ServeOptions>(
    protocols.map((protocol) => {
      switch (protocol) {
        case 'http': {
          return ['http', serveOptions]
        }

        case 'https': {
          return [
            'https',
            {
              ...serveOptions,
              createServer: https.createServer,
              serverOptions: {
                key: fs.readFileSync(SSL_KEY_PATH),
                cert: fs.readFileSync(SSL_CERT_PATH),
              },
            } satisfies ServeOptions,
          ]
        }

        default: {
          throw new Error(`Unsupported server protocol "${protocol}"`)
        }
      }
    }),
  )

  const abortAllConnections = async () => {
    const pendingAborts: Array<Promise<void>> = []
    for (const socket of sockets) {
      pendingAborts.push(abortConnection(socket))
    }
    return Promise.all(pendingAborts)
  }

  const listen = async () => {
    const pendingListens = []
    for (const [protocol, serveOptions] of serverInits) {
      pendingListens.push(
        startHttpServer(serveOptions).then((server) => {
          subscribeToConnections(server, sockets)
          servers.set(protocol, server)

          emitter.emit('listen', server)
        }),
      )
    }
    await Promise.all(pendingListens)
  }

  const api: TestHttpServer = {
    async [Symbol.asyncDispose]() {
      await this.close()
    },

    async close() {
      await abortAllConnections()

      const pendingClosures = []
      for (const [, server] of servers) {
        pendingClosures.push(closeHttpServer(server))
      }
      await Promise.all(pendingClosures)

      servers.clear()
    },

    get http() {
      const server = servers.get('http')

      if (server == null) {
        throw new Error(
          'HTTP server is not defined. Did you forget to include "http" in the "protocols" option?',
        )
      }

      return buildServerApi('http', server, app)
    },

    get https() {
      const server = servers.get('https')

      if (server == null) {
        throw new Error(
          'HTTPS server is not defined. Did you forget to include "https" in the "protocols" option?',
        )
      }

      return buildServerApi('https', server, app)
    },
  }

  Object.defineProperty(api, kEmitter, { value: emitter })
  Object.defineProperty(api, kApp, { value: app })
  Object.defineProperty(api, kServers, { value: servers })

  await listen()

  return api
}

async function startHttpServer(options: ServeOptions): Promise<ServerType> {
  const listenPromise = new DeferredPromise<ServerType>()

  const server = serve(options, () => {
    listenPromise.resolve(server)
  })
  server.once('error', (error) => {
    console.error(error)
    listenPromise.reject(error)
  })

  return listenPromise
}

async function closeHttpServer(server: ServerType): Promise<void> {
  if (!server.listening) {
    return Promise.resolve()
  }

  const closePromise = new DeferredPromise<void>()

  server.close((error) => {
    if (error) {
      closePromise.reject(error)
    }
    closePromise.resolve()
  })

  return closePromise.then(() => {
    server.unref()
  })
}

function subscribeToConnections(server: ServerType, sockets: Set<Socket>) {
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => {
      sockets.delete(socket)
    })
  })
}

async function abortConnection(socket: Socket): Promise<void> {
  if (socket.destroyed) {
    return Promise.resolve()
  }

  const abortPromise = new DeferredPromise<void>()

  socket.destroy()
  socket
    .on('close', () => abortPromise.resolve())
    .once('error', (error) => abortPromise.reject(error))

  return abortPromise
}

export function createUrlBuilder(
  baseUrl: string | URL,
  forceRelativePathname?: boolean,
): UrlBuilderFunction {
  return (pathname = '/') => {
    return new URL(
      forceRelativePathname ? toRelativePathname(pathname) : pathname,
      baseUrl,
    )
  }
}

export function toRelativePathname(pathname: string): string {
  return !pathname.startsWith('.') ? '.' + pathname : pathname
}

export function getServerUrl(protocol: string, server: ServerType): URL {
  let url: URL
  const address = server.address()

  if (address == null) {
    throw new Error('Failed to get server URL: server.address() returned null')
  }

  if (typeof address === 'string') {
    url = new URL(address)
  } else {
    const hostname =
      address.address.includes(':') &&
      !address.address.startsWith('[') &&
      !address.address.endsWith(']')
        ? `[${address.address}]`
        : address.address

    url = new URL(`http://${hostname}`)
    url.port = address.port.toString() ?? ''

    if (protocol === 'https') {
      url.protocol = 'https:'
    }
  }

  return url
}

function buildServerApi(
  protocol: TestHttpServerProtocol,
  server: ServerType,
  app: Hono,
): TestHttpServerApi {
  const baseUrl = getServerUrl(protocol, server)
  const api: TestHttpServerApi = {
    url: createUrlBuilder(baseUrl),
  }

  Object.defineProperty(api, kServer, { value: server })

  return api
}
