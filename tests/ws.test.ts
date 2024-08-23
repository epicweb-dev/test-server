import { WebSocket } from 'undici'
import { createTestHttpServer } from '../src/http.js'
import { createWebSocketMiddleware } from '../src/ws.js'

it('returns correct WebSocket URL', async () => {
  await using server = await createTestHttpServer()
  await using wss = createWebSocketMiddleware({ server, pathname: '/ws' })
  expect(wss.ws.url().pathname).toBe('/ws')
})

it('can be used as a disposable utility', async () => {
  await using server = await createTestHttpServer()
  await using wss = createWebSocketMiddleware({ server })

  wss.on('connection', (ws) => {
    ws.send('hello from server')
  })

  const client = new WebSocket(wss.ws.url())
  const messageCallback = vi.fn()
  client.onmessage = messageCallback
  client.onerror = (error) => console.log(error.message)

  await vi.waitFor(() => {
    expect(client.readyState).toBe(client.OPEN)
  })

  await vi.waitFor(() => {
    expect(messageCallback).toHaveBeenCalledOnce()
    expect(messageCallback).toHaveBeenCalledWith(expect.objectContaining({
      type: 'message',
      data: 'hello from server'
    }))
  })
})

it('creates a WebSocket server', async () => {
  await using server = await createTestHttpServer()
  await using wss = createWebSocketMiddleware({ server })

  const connectionListener = vi.fn()
  wss.once('connection', connectionListener)

  const client = new WebSocket(wss.ws.url())
  const openCallback = vi.fn()
  const errorCallback = vi.fn()
  client.onopen = openCallback
  client.onerror = errorCallback

  await vi.waitFor(() => {
    expect(openCallback).toHaveBeenCalledOnce()
  })

  expect(connectionListener).toHaveBeenCalledOnce()
  expect(errorCallback).not.toHaveBeenCalled()
})

it('creates a secure WebSocket connection', async () => {
  await using server = await createTestHttpServer({ protocols: ['https'] })
  await using wss = createWebSocketMiddleware({ server })

  const connectionListener = vi.fn()
  wss.once('connection', connectionListener)

  const client = new WebSocket(wss.wss.url())
  const openCallback = vi.fn()
  const errorCallback = vi.fn()
  client.onopen = openCallback
  client.onerror = errorCallback

  await vi.waitFor(() => {
    expect(openCallback).toHaveBeenCalledOnce()
  })

  expect(connectionListener).toHaveBeenCalledOnce()
  expect(errorCallback).not.toHaveBeenCalled()
})


it('disconnects all clients when closing the server', async () => {
  await using server = await createTestHttpServer({
    protocols: ['http', 'https']
  })
  await using wss = createWebSocketMiddleware({ server })

  const firstClient = new WebSocket(wss.ws.url())
  const secondClient = new WebSocket(wss.wss.url())

  await Promise.all([
    new Promise((resolve, reject) => {
      firstClient.onopen = resolve
      firstClient.onerror = reject
    }),
    new Promise((resolve, reject) => {
      secondClient.onopen = resolve
      secondClient.onerror = reject
    }),
  ])

  await wss.close()

  // All clients must be disconnected once the "close" Promise resolves.
  expect(firstClient.readyState).toBe(WebSocket.CLOSED)
  expect(secondClient.readyState).toBe(WebSocket.CLOSED)
})
