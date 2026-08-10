export function formatTimestamp(value: number): string {
  if (value <= 0) {
    return 'Unknown';
  }
  return new Date(value).toLocaleString();
}
