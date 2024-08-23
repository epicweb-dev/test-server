import { createTestHttpServer } from '../src/http.js'

it('allows overriding the default CORS middleware', async () => {
  await using server = await createTestHttpServer({
    defineRoutes(router) {
      router.options('/resource', () => {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': 'https://example.com',
            'Access-Control-Allow-Headers': 'origin, content-type',
          },
        })
      })
    }
  })

  const response = await fetch(server.http.url('/resource'), {
    method: 'OPTIONS',
  })

  // Receives a custom preflight response from the server.
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
    'https://example.com',
  )
  expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
    'origin, content-type',
  )
})
