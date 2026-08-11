export function badgeStateColor(state: string): string {
  switch (state) {
    case 'active':
      return 'badge-success';
    case 'waiting':
      return 'badge-warning';
    case 'completed':
      return 'badge-info';
    case 'failed':
      return 'badge-error';
    default:
      return 'badge-ghost';
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case 'ok':
    case 'up':
      return 'text-success';
    case 'degraded':
    case 'down':
      return 'text-error';
    case 'unknown':
      return 'text-warning';
    default:
      return '';
  }
}

export function statusDot(status: string): string {
  switch (status) {
    case 'ok':
    case 'up':
      return 'status status-success';
    case 'degraded':
    case 'down':
      return 'status status-error';
    case 'unknown':
      return 'status status-warning';
    default:
      return 'status';
  }
}
