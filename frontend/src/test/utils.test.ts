import { describe, it, expect, vi, Mock } from 'vitest';
import { Server, xdr } from '@stellar/stellar-sdk';
import { fetchTransactionStatus, StellarError, retryWithBackoff, defaultRetryConfig } from '../utils/stellar';

function formatAmount(amount: number): string {
  return `${amount} XLM`;
}

describe('Utils', () => {
  it('formats amount correctly', () => {
    expect(formatAmount(100)).toBe('100 XLM');
    expect(formatAmount(0)).toBe('0 XLM');
  });
});

describe('Stellar Utils', () => {
  describe('retryWithBackoff', () => {
    it('succeeds on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const result = await retryWithBackoff(defaultRetryConfig, operation);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('retries on transient error and succeeds', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new StellarError('transient', true))
        .mockResolvedValueOnce('success');
      
      const result = await retryWithBackoff(defaultRetryConfig, operation);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('fails immediately on non-transient error', async () => {
      const operation = vi.fn().mockRejectedValue(new StellarError('permanent', false));
      
      await expect(retryWithBackoff(defaultRetryConfig, operation)).rejects.toThrow('permanent');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('exhausts retries on persistent transient errors', async () => {
      const operation = vi.fn().mockRejectedValue(new StellarError('transient', true));
      
      await expect(retryWithBackoff(defaultRetryConfig, operation)).rejects.toThrow('transient');
      expect(operation).toHaveBeenCalledTimes(4); // initial + 3 retries
    }, 10000); // Increase timeout for this test
  });

  describe('fetchTransactionStatus', () => {
    it('fetches transaction status successfully', async () => {
      const mockServer = {
        getTransaction: vi.fn().mockResolvedValue({ resultXdr: 'mockResult' })
      } as any;

      const result = await fetchTransactionStatus(mockServer, 'hash123');
      expect(result).toBe('mockResult');
      expect(mockServer.getTransaction).toHaveBeenCalledWith('hash123');
    });

    it('retries on 503 error', async () => {
      const mockServer = {
        getTransaction: vi.fn()
          .mockRejectedValueOnce({ response: { status: 503 } })
          .mockResolvedValueOnce({ resultXdr: 'mockResult' })
      } as any;

      const result = await fetchTransactionStatus(mockServer, 'hash123');
      expect(result).toBe('mockResult');
      expect(mockServer.getTransaction).toHaveBeenCalledTimes(2);
    });

    it('does not retry on 400 error', async () => {
      const mockServer = {
        getTransaction: vi.fn().mockRejectedValue({ response: { status: 400, data: { message: 'Bad Request' } } })
      } as any;

      await expect(fetchTransactionStatus(mockServer, 'hash123')).rejects.toThrow();
      expect(mockServer.getTransaction).toHaveBeenCalledTimes(1);
    });
  });
});
