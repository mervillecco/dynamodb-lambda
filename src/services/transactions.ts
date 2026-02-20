import { ddb, TABLE_NAME } from './dynamoClient';
import {
  QueryCommand,
  GetCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const GLOBAL_GSI_NAME = 'GSI1';
const GLOBAL_TX_PARTITION = 'GLOBAL_TX';

/**
 * ACCESS PATTERN 1
 * lista transacciones de un usuario específico ordenadas por fecha descendente
 */
export async function listTransactionsByUser(
  userId: string,
  limit = 20,
  lastKey?: any
) {
  const params: any = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :txPrefix)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':txPrefix': 'TX#',
    },
    ScanIndexForward: false,
    Limit: limit,
  };
  if (lastKey) params.ExclusiveStartKey = lastKey;
  return ddb.send(new QueryCommand(params));
}

/**
 * ACCESS PATTERN 2
 * obtiene una transacción por su id directamente usando el item lookup
 */
export async function getTransactionById(txId: string) {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: `TX#${txId}`, sk: 'METADATA' },
    })
  );
  return res.Item;
}

/**
 * ACCESS PATTERN 4
 * devuelve las últimas N transacciones globales del sistema
 */
export async function getLatestGlobalTransactions(limit = 10) {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GLOBAL_GSI_NAME,
      KeyConditionExpression: 'GSI1PK = :globalPk',
      ExpressionAttributeValues: {
        ':globalPk': GLOBAL_TX_PARTITION,
      },
      ScanIndexForward: false,
      Limit: limit,
    })
  );
  return res.Items ?? [];
}

export async function createTransaction(
  userId: string,
  payload: any,
  idempotencyKey?: string
) {
  const txId = `tx-${uuidv4()}`;
  const now = new Date().toISOString();

  const gsiAttrs = {
    GSI1PK: GLOBAL_TX_PARTITION,
    GSI1SK: now,
  };

  const itemUser = {
    pk: `USER#${userId}`,
    sk: `TX#${now}#${txId}`,
    entityType: 'TRANSACTION',
    txId,
    userId,
    createdAt: now,
    ...gsiAttrs,
    ...payload,
  };

  const itemLookup = {
    pk: `TX#${txId}`,
    sk: 'METADATA',
    entityType: 'TRANSACTION',
    txId,
    userId,
    createdAt: now,
    ...gsiAttrs,
    ...payload,
  };

  const transactItems: any[] = [
    { Put: { TableName: TABLE_NAME, Item: itemUser } },
    { Put: { TableName: TABLE_NAME, Item: itemLookup } },
  ];

  if (idempotencyKey) {
    transactItems.push({
      Put: {
        TableName: TABLE_NAME,
        Item: {
          pk: `IDE#${idempotencyKey}`,
          sk: 'METADATA',
          entityType: 'IDEMPOTENCY',
          txId,
          userId,
          createdAt: now,
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      },
    });
  }

  try {
    await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }));
    return itemLookup;
  } catch (err: any) {
    const isConditional =
      err.name === 'ConditionalCheckFailedException' ||
      (err.$metadata?.httpStatusCode === 400 &&
        /ConditionalCheckFailed/.test(err.message ?? ''));

    if (isConditional && idempotencyKey) {
      try {
        const idemRes = await ddb.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { pk: `IDE#${idempotencyKey}`, sk: 'METADATA' },
          })
        );
        if (idemRes.Item?.txId) {
          return getTransactionById(idemRes.Item.txId);
        }
      } catch (recoveryErr) {
        console.warn('Failed to recover idempotent item:', recoveryErr);
      }
    }
    throw err;
  }
}