# Test Server

Utility for creating HTTP and WebSocket servers for testing.

## Features

- **Compact**. Spawn servers on-demand while keeping the test setup to the minimum.
- **Automatically disposable**. This utility is build with the [`using`](https://www.totaltypescript.com/typescript-5-2-new-keyword-using) keyword in mind. Any servers you spawn are automatically closed once nothing is using them.
- **Standard-based**. Handle requests and responses using the web standards. This library uses [Hono](https://hono.dev/) to spawn servers.

## Install

```sh
npm install @epic-web/test-server
```

## Usage

### HTTP server

```ts
import { createTestHttpServer } from '@epic-web/test-server/http'

it('fetches the list of numbers', async () => {
  // Create a disposable "server" instance.
  await using server = await createTestHttpServer({
    defineRoutes(router) {
      router.get('/numbers', () => {
        return Response.json([1, 2, 3])
      })
    }
  })

  // Construct URLs relatively to the test server.
  const response = await fetch(server.http.url('/numbers'))
  await expect(response.json()).resolves.toEqual([1, 2, 3])
})
```

### WebSocket server

```ts
import { createTestHttpServer } from '@epic-web/test-server/http'
import { createWebSocketMiddleware } from '@epic-web/test-server/ws'

it('handles WebSocket communication', async () => {
  await using server = await createTestHttpServer()
  // Attach WebSockets as a middleware to an existing HTTP server.
  await using wss = await createWebSocketMiddleware({ server })

  // Handle WebSocket connections.
  wss.ws.on('connect', (socket) => console.log('new connection!'))

  const client = new WebSocket(wss.ws.url())
})
```

## API

### `createTestHttpServer([options])`

Creates an HTTP server instance.

- `options` (optional)
  - `protocols`, (optional) `Array<'http' | 'https'>` (default: `['http']`), the list of protocols to use when spawning the test server. Providing multiple values will spawn multiple servers with the corresponding controls via `server.http` and `server.https`.
  - `defineRoutes`, (optional) `(router: Router) => void`, a function describing the server's routes.
- Returns: [`TestHttpServer`](#testhttpserver)

### `TestHttpServer`

#### `TestHttpServer.http.url([pathname])`

- `pathname` (optional, default: `/`), `string`, a pathname to resolve against the server's URL.
- Returns: `URL`.

Calling the `.url()` method without any arguments returns this server's URL:

```ts
server.http.url() // URL<http://localhost:56783/>
```

Providing the `pathname` argument returns a URL for that path:

```ts
server.http.url('/resource') // URL<http://localhost:56783/resource>
```

#### `TestHttpServer.close()`

Closes the HTTP server, aborting any pending requests.

> [!IMPORTANT]
> The `createTestHttpServer()` is a _disposable_ utility. It means that JavaScript will automatically dispose of the server instance (i.e. close it) when nothing else is referencing the `server` object. _You don't have to manually close the server_. But you _can_ close the server amidst a test, if that's what your test needs.

### `createWebSocketMiddleware(options)`

- `options`
  - `server`, [`TestHttpServer`](#testhttpserver), a reference to the existing test HTTP server object.
- Returns: [TestWebSocketServer](#testwebsocketserver)

> Note: The WebSocket middleware will automatically attach itself to all spawned HTTP servers. If you are using multiple servers at once (e.g. HTTP + HTTPS), both `wss.ws` and `wss.wss` APIs will be available for WebSockets respectively.

### `TestWebSocketServer`

#### `TestWebSocketServer.on(type, listener)`

Adds a listener for the given event.

```ts
wss.ws.on('connection', () => {})
wss.wss.on('connection', () => {})
```

#### `TestWebSocketServer.once(type, listener)`

Adds a one-time listener for the given event.

#### `TestWebSocketServer.off(type, listener)`

Removes a listener from the given event.
