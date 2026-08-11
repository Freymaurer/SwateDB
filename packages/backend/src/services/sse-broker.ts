import type { ServerResponse } from 'node:http';

export type SseEventType = 'job-updated';

export class SseBroker {
	private readonly clients = new Set<ServerResponse>();

	addClient(res: ServerResponse): void {
		this.clients.add(res);
		res.on('close', () => {
			this.clients.delete(res);
		});
	}

	removeClient(res: ServerResponse): void {
		this.clients.delete(res);
	}

	broadcast(type: SseEventType, payload: unknown): void {
		const data = JSON.stringify(payload);
		const message = `event: ${type}\ndata: ${data}\n\n`;

		for (const client of this.clients) {
			if (client.writableEnded) {
				this.clients.delete(client);
				continue;
			}
			client.write(message);
		}
	}
}

let sharedBroker: SseBroker | null = null;

export function getSseBroker(): SseBroker {
	if (sharedBroker === null) {
		sharedBroker = new SseBroker();
	}
	return sharedBroker;
}

export function resetSseBrokerForTests(): void {
	sharedBroker = null;
}
