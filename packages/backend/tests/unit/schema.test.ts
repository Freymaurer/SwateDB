import type { Driver } from 'neo4j-driver';
import { describe, expect, it, vi } from 'vitest';
import { ensureSchema, SCHEMA_STATEMENTS } from '../../src/db/schema';

describe('ensureSchema', () => {
  it('executes all schema statements', async () => {
    const run = vi.fn(async () => ({}));
    const close = vi.fn(async () => undefined);
    const session = {
      run,
      close,
    };

    const driver = {
      session: vi.fn(() => session),
    } as unknown as Driver;

    await ensureSchema(driver);

    expect(run).toHaveBeenCalledTimes(SCHEMA_STATEMENTS.length);
    for (const statement of SCHEMA_STATEMENTS) {
      expect(run).toHaveBeenCalledWith(statement);
    }
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes session when schema creation fails', async () => {
    const close = vi.fn(async () => undefined);
    const session = {
      run: vi.fn(async () => {
        throw new Error('schema failed');
      }),
      close,
    };

    const driver = {
      session: vi.fn(() => session),
    } as unknown as Driver;

    await expect(ensureSchema(driver)).rejects.toThrow(/schema failed/);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
