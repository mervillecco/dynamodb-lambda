import type { APIGatewayProxyHandler } from 'aws-lambda';
import { validateToken } from '../services/auth';
import { getTransactionById } from '../services/transactions';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = event.headers.Authorization || event.headers.authorization;
    const payload = await validateToken(auth as string);
    const userId = (payload as any).sub;
    const txId = event.pathParameters?.id!;
    const item = await getTransactionById(txId);
    if (!item) return { statusCode: 404, body: JSON.stringify({ error: 'Transaction not found' }) };
    if (item.userId !== userId) return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
    return { statusCode: 200, body: JSON.stringify(item) };
  } catch (err: any) {
    console.error('transactionGetById error:', err);
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message || 'Internal Server Error' }) };
  }
};