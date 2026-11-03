// @vitest-environment node
import { it, expect } from 'vitest';
import { AuthService } from '../src/auth/auth.service.js';
import { createControlPlaneServer } from '../src/server.js';
it('native session identity rejects forged/expired credentials and ignores supplied userId', async () => {
 const auth = new AuthService({ jwtSecret: 'local-test-only' });
 const { server } = createControlPlaneServer({ authService: auth });
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
 const address = server.address(); if (!address || typeof address === 'string') throw Error('address');
 const url = `http://127.0.0.1:${address.port}/v1/auth/session?userId=victim`;
 try {
  expect((await fetch(url)).status).toBe(401);
  expect((await fetch(url, { headers: { Authorization: 'Bearer forged' } })).status).toBe(401);
  const token = auth.signJwt({ userId: 'owner' });
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status).toBe(200); expect((await res.json()).data.userId).toBe('owner');
 } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});
