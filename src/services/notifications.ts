import { ddb, TABLE_NAME } from './dynamoClient';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';

export async function listNotificationsByUser(userId: string, limit = 20, lastKey?: any) {
  const params: any = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :notifPrefix)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':notifPrefix': 'NOTIF#'
    },
    ScanIndexForward: false,
    Limit: limit
  };
  if (lastKey) params.ExclusiveStartKey = lastKey;
  const res: any = await ddb.send(new QueryCommand(params));
  return res;
}