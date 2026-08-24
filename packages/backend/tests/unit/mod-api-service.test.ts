import type { Driver } from 'neo4j-driver';
import { describe, expect, it, vi } from 'vitest';
import { createModApiService } from '../../src/routes/mod-api/service';

describe('MOD API service', () => {
  it('countTerms returns the number of Term nodes in the database', async () => {
    const run = vi.fn().mockResolvedValue({
      records: [{ get: (key: string) => (key === 'count' ? 42 : undefined) }],
    });
    const close = vi.fn().mockResolvedValue(undefined);
    const session = { run, close };
    const driver = { session: () => session } as unknown as Driver;

    const service = createModApiService(driver);
    const count = await service.countTerms();

    expect(count).toBe(42);
    expect(run).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('countTerms returns 0 when the count record is missing', async () => {
    const run = vi.fn().mockResolvedValue({ records: [] });
    const close = vi.fn().mockResolvedValue(undefined);
    const session = { run, close };
    const driver = { session: () => session } as unknown as Driver;

    const service = createModApiService(driver);
    const count = await service.countTerms();

    expect(count).toBe(0);
  });
});
