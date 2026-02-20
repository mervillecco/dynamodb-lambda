import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as transactionsService from '../src/services/transactions';
import { ddb } from '../src/services/dynamoClient';

const FIXED_DATE = '2026-02-18T18:00:00.000Z';

describe('createTransaction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_DATE));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('creates transaction successfully (no idempotency)', async () => {
    const sendMock = vi.spyOn(ddb, 'send').mockResolvedValue({} as any);

    const payload = { amount: 10.5, currency: 'ARS', status: 'PENDING', data: {} };
    const result = await transactionsService.createTransaction('user-1', payload);

    expect(result).toBeTruthy();
    expect(result.txId).toBeDefined();
    expect(sendMock).toHaveBeenCalled();

    sendMock.mockRestore();
  });

  it('returns existing transaction when idempotency key already exists', async () => {
    const conditionalError: any = new Error('The conditional request failed');
    conditionalError.name = 'ConditionalCheckFailedException';

    const txIdExisting = 'tx-existing-123';

    const sendMock = vi.spyOn(ddb, 'send')
      .mockRejectedValueOnce(conditionalError)
      .mockResolvedValueOnce({ Item: { pk: 'IDE#idem-1', sk: 'METADATA', txId: txIdExisting } } as any)
      .mockResolvedValueOnce({ Item: { pk: `TX#${txIdExisting}`, sk: 'METADATA', txId: txIdExisting, userId: 'user-1', amount: 10.5 } } as any);

    const payload = { amount: 10.5, currency: 'ARS', status: 'PENDING', data: {} };

    const result = await transactionsService.createTransaction('user-1', payload, 'idem-1');

    expect(result).toBeTruthy();
    expect(result.txId).toBe(txIdExisting);

    sendMock.mockRestore();
  });
});
