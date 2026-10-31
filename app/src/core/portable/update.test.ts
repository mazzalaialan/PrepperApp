import { describe, expect, it } from 'vitest';
import { compareVersions, newerRelease, parseRelease, RELEASES_URL } from './update';

describe('versiones del paquete portable', () => {
  it('compara números, no texto', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1);
    expect(compareVersions('v0.7.1', '0.7.1')).toBe(0);
    expect(compareVersions('0.7.0', '0.7.1')).toBe(-1);
    expect(compareVersions('1.0', '0.99.99')).toBe(1);
  });

  it('toma el .zip del paquete de la Release', () => {
    const r = parseRelease({
      tag_name: 'v0.8.0',
      html_url: 'https://github.com/x/releases/tag/v0.8.0',
      assets: [{ name: 'otra-cosa.txt', browser_download_url: 'a' }, { name: 'vikarg-survival-portable-0.8.0.zip', browser_download_url: 'zip-url' }],
    });
    expect(r).toEqual({ version: '0.8.0', downloadUrl: 'zip-url' });
    expect(parseRelease({ tag_name: 'v0.8.0' })!.downloadUrl).toBe(RELEASES_URL);
    expect(parseRelease({})).toBeNull();
  });

  it('solo avisa si la publicada es más nueva', () => {
    const latest = { version: '0.8.0', downloadUrl: 'x' };
    expect(newerRelease(latest, '0.7.1')).toBe(latest);
    expect(newerRelease(latest, '0.8.0')).toBeNull();
    expect(newerRelease(null, '0.7.1')).toBeNull();
  });
});
