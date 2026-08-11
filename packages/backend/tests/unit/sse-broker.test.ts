import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSseBroker, resetSseBrokerForTests } from '../../src/services/sse-broker';
import type { ServerResponse } from 'node:http';

function mockResponse() {
	const chunks: string[] = [];

	let writableEnded = false;

	const res = {
		get writableEnded() {
			return writableEnded;
		},

		write: vi.fn((chunk: string) => {
			chunks.push(chunk);
			return true;
		}),

		end: vi.fn(() => {
			writableEnded = true;
			return res;
		}),

		on: vi.fn(),
		removeListener: vi.fn(),
		once: vi.fn(),
		off: vi.fn(),
	} as unknown as ServerResponse;

	return {
		res,
		chunks,
		setWritableEnded: (value: boolean) => {
			writableEnded = value;
		},
	};
}

describe('SseBroker', () => {
	beforeEach(() => {
		resetSseBrokerForTests();
	});

	it('addClient registers a client', () => {
		const broker = getSseBroker();
		const { res } = mockResponse();
		broker.addClient(res);
		expect(res.on).toHaveBeenCalledWith('close', expect.any(Function));
	});

	it('broadcast writes to all connected clients', () => {
		const broker = getSseBroker();
		const { res: client1, chunks: chunks1 } = mockResponse();
		const { res: client2, chunks: chunks2 } = mockResponse();

		broker.addClient(client1);
		broker.addClient(client2);
		broker.broadcast('job-updated', { id: '1', name: 'test', state: 'completed' });

		expect(chunks1.length).toBeGreaterThan(0);
		expect(chunks2.length).toBeGreaterThan(0);

		const emitted1 = chunks1.join('');
		expect(emitted1).toContain('event: job-updated');
		expect(emitted1).toContain('"id":"1"');

		const emitted2 = chunks2.join('');
		expect(emitted2).toContain('event: job-updated');
		expect(emitted2).toContain('"id":"1"');
	});

	it('removeClient stops receiving broadcasts', () => {
		const broker = getSseBroker();
		const { res } = mockResponse();

		broker.addClient(res);
		broker.removeClient(res);
		broker.broadcast('job-updated', { id: '1' });

		expect(res.write).not.toHaveBeenCalled();
	});

	it('does not write to ended clients and removes them', () => {
		const broker = getSseBroker();
		const { res, setWritableEnded } = mockResponse();
    
		broker.addClient(res);
    setWritableEnded(true);
		broker.broadcast('job-updated', { id: '1' });

		expect(res.write).not.toHaveBeenCalled();
	});
});
