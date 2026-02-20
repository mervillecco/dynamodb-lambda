import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

vi.mock('../services/auth', () => ({
  validateToken: vi.fn(),
}));

vi.mock('../services/transactions', () => ({
  createTransaction: vi.fn(),
}));

import { handler } from '../handlers/transactionsPost';
import { validateToken } from '../services/auth';
import { createTransaction } from '../services/transactions';

describe('transactionsPost handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 201 when transaction is created successfully', async () => {
    (validateToken as any).mockResolvedValue({ sub: 'user-1' });
    (createTransaction as any).mockResolvedValue({
      txId: 'tx-123',
      amount: 100,
    });

    const event = {
        headers: {
            Authorization: 'Bearer fake-token',
        },
        body: JSON.stringify({ amount: 100 }),
    } as unknown as APIGatewayProxyEvent;

    const raw = await handler(event, {} as any, () => {});
    const response = raw as APIGatewayProxyResult;

    expect(response.statusCode).toBe(201);

    const body = JSON.parse(response.body);
    expect(body.txId).toBe('tx-123');
  });

  it('returns 401 when Authorization header is missing', async () => {
    const event = {
      headers: {},
      body: JSON.stringify({ amount: 100 }),
    } as APIGatewayProxyEvent;

    const raw = await handler(event, {} as any, () => {});
    const response = raw as APIGatewayProxyResult;

    expect(response.statusCode).toBe(401);
  });

  it('returns 400 when body is invalid JSON', async () => {
    (validateToken as any).mockResolvedValue({ sub: 'user-1' });

    const event = {
        headers: {
            Authorization: 'Bearer fake-token',
        },
        body: '{ invalid json }',
    } as unknown as APIGatewayProxyEvent;

    const raw = await handler(event, {} as any, () => {});
    const response = raw as APIGatewayProxyResult;

    expect(response.statusCode).toBe(400);
  });

  it('returns 500 when service throws unexpected error', async () => {
    (validateToken as any).mockResolvedValue({ sub: 'user-1' });
    (createTransaction as any).mockRejectedValue(new Error('DB down'));

    const event = {
        headers: {
            Authorization: 'Bearer fake-token',
        },
        body: JSON.stringify({ amount: 100 }),
    } as unknown as APIGatewayProxyEvent;

    const raw = await handler(event, {} as any, () => {});
    const response = raw as APIGatewayProxyResult;

    expect(response.statusCode).toBe(500);
  });
});
