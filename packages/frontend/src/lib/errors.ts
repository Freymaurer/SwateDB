import { ApiError } from '../api';

export function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.message} (HTTP ${error.statusCode})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function isAuthError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.statusCode === 401 || error.statusCode === 403);
}

export function toTokenPromptMessage(error: ApiError): string {
  if (error.statusCode === 403) {
    return 'Admin token was rejected (403). Ensure the running backend ADMIN_TOKEN matches the value you entered.';
  }
  if (error.statusCode === 401) {
    return 'Bearer token was not accepted (401). Please provide a valid ADMIN_TOKEN.';
  }
  return toErrorMessage(error);
}
