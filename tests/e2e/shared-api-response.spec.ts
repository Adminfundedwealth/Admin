import { expect, test } from '@playwright/test';
import { readApiJson } from '../../src/lib/api/fetch';

test.describe('shared API response parsing', () => {
  test('accepts a JSON object response', async () => {
    await expect(readApiJson(new Response('{"data":[]}'))).resolves.toEqual({ data: [] });
  });

  test('preserves the status when the response is empty', async () => {
    await expect(readApiJson(new Response(null, { status: 204 })))
      .rejects.toThrow('empty response (HTTP 204)');
  });

  test('preserves the status when the response is not JSON', async () => {
    await expect(readApiJson(new Response('<html>', { status: 502 })))
      .rejects.toThrow('invalid response (HTTP 502)');
  });

  test('rejects JSON values that do not match the API object contract', async () => {
    await expect(readApiJson(new Response('[]')))
      .rejects.toThrow('invalid response (HTTP 200)');
  });
});
