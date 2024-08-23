import { createTestHttpServer } from '../src/http.js'

const books = [
  'The Lord of the Rings',
  'The Song of Ice and Fire'
]

test('creates an HTTP server', async () => {
  await using server = await createTestHttpServer({
    defineRoutes(router) {
      router.get('/', () => new Response())
    }
  })
  const response = await fetch(server.http.url('/'), { method: 'HEAD' })
  expect(response.status).toBe(200)
})

test('creates an HTTPS server', async () => {
  await using server = await createTestHttpServer({
    protocols: ['https'],
    defineRoutes(router) {
      router.get('/', () => new Response())
    }
  })
  const response = await fetch(server.https.url('/'), {
    method: 'HEAD',
  })
  expect(response.status).toBe(200)
})

test('applies the root router to HTTP server', async () => {
  await using server = await createTestHttpServer({
    defineRoutes(router) {
      router.get('/books', () => Response.json(books))
    }
  })
  const httpResponse = await fetch(server.http.url('/books'))
  const httpResponseBody = await httpResponse.json()

  expect(httpResponseBody).toEqual([
    'The Lord of the Rings',
    'The Song of Ice and Fire',
  ])
})

test('applies the root router to HTTPS server', async () => {
  await using server = await createTestHttpServer({
    protocols: ['https'],
    defineRoutes(router) {
      router.get('/books', () => Response.json(books))
    }
  })
  const httpsResponse = await fetch(server.https.url('/books'))
  const httpsResponseBody = await httpsResponse.json()

  expect(httpsResponseBody).toEqual([
    'The Lord of the Rings',
    'The Song of Ice and Fire',
  ])
})

test('returns server addresses', async () => {
  await using server = await createTestHttpServer({
    protocols: ['http', 'https'],
    defineRoutes(router) {
      router.get('/', () => new Response())
    }
  })
  const httpUrl = server.http.url()
  expect(httpUrl.protocol).toBe('http:')
  expect(httpUrl.hostname).toBe('127.0.0.1')
  expect(httpUrl.port).toMatch(/^\d+$/)

  const httpsUrl = server.https.url()
  expect(httpsUrl.protocol).toBe('https:')
  expect(httpsUrl.hostname).toBe('127.0.0.1')
  expect(httpsUrl.port).toMatch(/^\d+$/)
})
