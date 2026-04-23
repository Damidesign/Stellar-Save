import { Server, TransactionBuilder, Networks, Keypair, Transaction, xdr } from '@stellar/stellar-sdk';

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

export const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
};

export class StellarError extends Error {
  public isTransient: boolean;

  constructor(message: string, isTransient: boolean = false) {
    super(message);
    this.isTransient = isTransient;
    this.name = 'StellarError';
  }
}

export async function retryWithBackoff<T>(
  config: RetryConfig,
  operation: () => Promise<T>
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // If it's the last attempt or not a transient error, throw
      if (attempt === config.maxRetries || !(error instanceof StellarError) || !(error as StellarError).isTransient) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(config.baseDelay * Math.pow(2, attempt), config.maxDelay);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

export async function fetchTransactionStatus(
  server: Server,
  txHash: string,
  retryConfig: RetryConfig = defaultRetryConfig
): Promise<xdr.TransactionResult> {
  return retryWithBackoff(retryConfig, async () => {
    try {
      const response = await server.getTransaction(txHash);
      return response.resultXdr;
    } catch (error: any) {
      // Check if it's a transient error
      if (error.response) {
        const status = error.response.status;
        if (status === 503 || status === 504 || status === 429) {
          // Service Unavailable, Gateway Timeout, Too Many Requests - retry
          throw new StellarError(`HTTP ${status}: ${error.message}`, true);
        } else if (status >= 400 && status < 500) {
          // Client errors - don't retry
          throw new StellarError(`HTTP ${status}: ${error.message}`, false);
        } else if (status >= 500) {
          // Server errors - retry
          throw new StellarError(`HTTP ${status}: ${error.message}`, true);
        }
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        // Network errors - retry
        throw new StellarError(`Network error: ${error.message}`, true);
      }

      // Other errors - don't retry
      throw new StellarError(`Unknown error: ${error.message}`, false);
    }
  });
}