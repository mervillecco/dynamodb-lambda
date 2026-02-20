import type { APIGatewayProxyHandler } from 'aws-lambda';
import { validateToken } from '../services/auth';
import { createTransaction } from '../services/transactions';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth =
      event.headers?.Authorization || event.headers?.authorization;

    if (!auth) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const payload = await validateToken(auth);
    const userId = (payload as any).sub;

    let body: any;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON' }),
      };
    }

    if (!body.amount) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'amount required' }),
      };
    }

    const idempotencyKey =
      event.headers?.['Idempotency-Key'] ||
      event.headers?.['idempotency-key'] ||
      event.headers?.['Idempotency-key'];

    const newTx = await createTransaction(
      userId,
      {
        amount: body.amount,
        currency: body.currency || 'ARS',
        status: 'PENDING',
        data: body.data || {},
      },
      idempotencyKey as string | undefined
    );

    return {
      statusCode: 201,
      body: JSON.stringify(newTx),
    };
  } catch (err: any) {
    console.error('transactionsPost error:', err);

    if (err.name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: 'Request already processed' }),
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  }
};
