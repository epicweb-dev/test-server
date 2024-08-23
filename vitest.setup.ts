import { setGlobalDispatcher, Agent } from 'undici'

beforeAll(() => {
  setGlobalDispatcher(
    new Agent({
      connect: {
        /**
         * @note Allow insecure connections to HTTPS servers
         * with self-signed certificates in tests.
         */
        rejectUnauthorized: false,
      },
    }),
  )
})
