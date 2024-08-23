import { createTestHttpServer } from '../src/http.js'

test('returns correct server URL when using IPv6 address', async () => {
  await using server = await createTestHttpServer({
    hostname: '::1',
    protocols: ['http', 'https']
  })

  expect(server.http.url().href).toMatch(/^http:\/\/\[::1\]:\d{4,}\/$/)
  expect(server.https.url().href).toMatch(/^https:\/\/\[::1\]:\d{4,}\/$/)
})
