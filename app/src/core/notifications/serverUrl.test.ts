import { describe, expect, it } from 'vitest';
import { isAcceptableServerUrl } from './notifications';

describe('dirección del servidor', () => {
  it('acepta https y rechaza http salvo en la propia máquina o la red local', () => {
    for (const ok of ['https://valhallarust2.ddns.net', 'https://example.com:8443/', 'http://localhost:8080', 'http://127.0.0.1:8099', 'http://[::1]:8080', 'http://192.168.0.104:8080', 'http://10.0.0.5', 'http://172.16.3.4', 'http://172.31.255.1']) {
      expect(isAcceptableServerUrl(ok), ok).toBe(true);
    }
    for (const bad of ['http://valhallarust2.ddns.net', 'http://8.8.8.8', 'http://172.32.0.1', 'http://192.169.0.1', 'ftp://example.com', 'valhallarust2.ddns.net', '', 'javascript:alert(1)']) {
      expect(isAcceptableServerUrl(bad), bad).toBe(false);
    }
  });
});
