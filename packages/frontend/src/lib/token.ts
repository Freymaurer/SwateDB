const TOKEN_STORAGE_KEY = 'swatedb.adminToken';

export function readStoredToken(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
}

export function storeToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (token.trim().length === 0) {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
}
