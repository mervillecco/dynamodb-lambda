import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// Ahora usamos '@/' como prefijo en los mocks. Vitest resuelve '@/'
// como la carpeta src/ gracias al alias, garantizando que el mock
// intercepte exactamente el módulo que usa el handler.
vi.mock('@/services/auth', () => ({
  validateToken: vi.fn(),
}));

vi.mock('@/services/transactions', () => ({
  createTransaction: vi.fn(),
}));

import { handler } from '../src/handlers/transactionsPost';
import { validateToken } from '../src/services/auth';
import { createTransaction } from '../src/services/transactions';

// El resto de los tests no cambia en absoluto
describe('transactionsPost handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 201 when transaction is created successfully', async () => {
    (validateToken as any).mockResolvedValue({ sub: 'user-1' });
    (createTransaction as any).mockResolvedValue({ txId: 'tx-123', amount: 100 });

    const event = {
      headers: { Authorization: 'Bearer fake-token' },
      body: JSON.stringify({ amount: 100 }),
    } as unknown as APIGatewayProxyEvent;

    const raw = await handler(event, {} as any, () => {});
    const response = raw as APIGatewayProxyResult;

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body).txId).toBe('tx-123');
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
      headers: { Authorization: 'Bearer fake-token' },
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
      headers: { Authorization: 'Bearer fake-token' },
      body: JSON.stringify({ amount: 100 }),
    } as unknown as APIGatewayProxyEvent;

    const raw = await handler(event, {} as any, () => {});
    const response = raw as APIGatewayProxyResult;

    expect(response.statusCode).toBe(500);
  });
});