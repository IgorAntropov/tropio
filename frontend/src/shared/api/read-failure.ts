export function readFailureStatus(error: unknown): number {
  if (error && typeof error === 'object') {
    const status = 'statusCode' in error ? error.statusCode : 'status' in error ? error.status : undefined;
    if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599) {
      return status;
    }
  }
  return 503;
}

export function canRetryRead(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}
