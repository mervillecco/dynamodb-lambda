export type TxItem = {
  pk: string;
  sk: string;
  entityType: 'TRANSACTION' | 'USER' | 'NOTIFICATION';
  txId?: string;
  userId?: string;
  createdAt?: string;
  [k: string]: any;
};