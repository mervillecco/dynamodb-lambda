import type { APIGatewayProxyHandler } from 'aws-lambda';
import { validateToken } from '../services/auth';
import { listNotificationsByUser } from '../services/notifications';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = event.headers.Authorization || event.headers.authorization;
    const payload = await validateToken(auth as string);
    const userId = (payload as any).sub;

    const query = event.queryStringParameters || {};
    const limit = query.limit ? Number(query.limit) : 20;
    const lastKey = query.lastKey ? JSON.parse(decodeURIComponent(query.lastKey)) : undefined;

    const result = await listNotificationsByUser(userId, limit, lastKey);
    return { statusCode: 200, body: JSON.stringify({ items: result.Items || [], lastKey: result.LastEvaluatedKey || null }) };
  } catch (err: any) {
    console.error('notificationsGet error:', err);
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message || 'Internal Server Error' }) };
  }
};