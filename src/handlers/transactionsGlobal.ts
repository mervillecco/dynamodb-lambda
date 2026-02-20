import type { APIGatewayProxyHandler } from 'aws-lambda';
import { validateToken } from '../services/auth';
import { getLatestGlobalTransactions } from '../services/transactions';

/**
 * GET /transactions/global
 *
 * Devuelve las últimas 10 transacciones del sistema completo,
 * sin filtrar por usuario. Requiere autenticación válida.
 *
 * Utiliza el GSI "GSI1" donde:
 *   - GSI1PK = "GLOBAL_TX"   (partition key fija para agrupar todas las transacciones)
 *   - GSI1SK = createdAt ISO  (sort key para ordenar por fecha descendente)
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = event.headers.Authorization || event.headers.authorization;
    await validateToken(auth as string);

    const items = await getLatestGlobalTransactions(10);

    return {
      statusCode: 200,
      body: JSON.stringify({ items }),
    };
  } catch (err: any) {
    console.error('transactionsGlobal error:', err);
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message || 'Internal Server Error' }),
    };
  }
};