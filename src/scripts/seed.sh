#!/bin/bash

set -e

TABLE_NAME="AppCore"
REGION="us-east-1"
ENDPOINT="http://localhost:8000"

# Verificamos que DynamoDB Local esté corriendo antes de continuar.
# Sin este chequeo, los errores de conexión son difíciles de interpretar.
echo "🔍 Checking DynamoDB Local is running..."
curl -sf $ENDPOINT > /dev/null || {
  echo "❌ DynamoDB Local is not running. Start it with: docker-compose up -d"
  exit 1
}

echo "🚀 Creating DynamoDB table..."

aws dynamodb create-table \
  --table-name $TABLE_NAME \
  --attribute-definitions \
      AttributeName=pk,AttributeType=S \
      AttributeName=sk,AttributeType=S \
      AttributeName=GSI1PK,AttributeType=S \
      AttributeName=GSI1SK,AttributeType=S \
  --key-schema \
      AttributeName=pk,KeyType=HASH \
      AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[
    {
      "IndexName":"GSI1",
      "KeySchema":[
        {"AttributeName":"GSI1PK","KeyType":"HASH"},
        {"AttributeName":"GSI1SK","KeyType":"RANGE"}
      ],
      "Projection":{"ProjectionType":"ALL"}
    }
  ]' \
  --endpoint-url $ENDPOINT \
  --region $REGION || echo "⚠️  Table may already exist, continuing..."

echo "✅ Table ready."

echo "🌱 Seeding data..."

# Usuario de prueba
aws dynamodb put-item \
  --table-name $TABLE_NAME \
  --endpoint-url $ENDPOINT \
  --region $REGION \
  --item '{
    "pk":{"S":"USER#a1b2c3"},
    "sk":{"S":"PROFILE"},
    "entityType":{"S":"USER"},
    "userId":{"S":"a1b2c3"},
    "createdAt":{"S":"2026-02-18T10:00:00Z"},
    "data":{"M":{
      "email":{"S":"dev@example.com"},
      "name":{"S":"Maria Dev"}
    }}
  }'

# Transacción bajo la partición del usuario (access pattern 1).
# GSI1PK y GSI1SK son necesarios para que aparezca en el access pattern 4.
aws dynamodb put-item \
  --table-name $TABLE_NAME \
  --endpoint-url $ENDPOINT \
  --region $REGION \
  --item '{
    "pk":{"S":"USER#a1b2c3"},
    "sk":{"S":"TX#2026-02-18T16:30:00Z#tx-9f8e7"},
    "entityType":{"S":"TRANSACTION"},
    "txId":{"S":"tx-9f8e7"},
    "userId":{"S":"a1b2c3"},
    "amount":{"N":"125.5"},
    "currency":{"S":"ARS"},
    "status":{"S":"COMPLETED"},
    "createdAt":{"S":"2026-02-18T16:30:00Z"},
    "GSI1PK":{"S":"GLOBAL_TX"},
    "GSI1SK":{"S":"2026-02-18T16:30:00Z"}
  }'

# Lookup directo de la transacción por ID (access pattern 2).
# Duplica los atributos GSI para que también aparezca en el GSI1.
aws dynamodb put-item \
  --table-name $TABLE_NAME \
  --endpoint-url $ENDPOINT \
  --region $REGION \
  --item '{
    "pk":{"S":"TX#tx-9f8e7"},
    "sk":{"S":"METADATA"},
    "entityType":{"S":"TRANSACTION"},
    "txId":{"S":"tx-9f8e7"},
    "userId":{"S":"a1b2c3"},
    "amount":{"N":"125.5"},
    "currency":{"S":"ARS"},
    "status":{"S":"COMPLETED"},
    "createdAt":{"S":"2026-02-18T16:30:00Z"},
    "GSI1PK":{"S":"GLOBAL_TX"},
    "GSI1SK":{"S":"2026-02-18T16:30:00Z"}
  }'

# Notificación del usuario (access pattern 3)
aws dynamodb put-item \
  --table-name $TABLE_NAME \
  --endpoint-url $ENDPOINT \
  --region $REGION \
  --item '{
    "pk":{"S":"USER#a1b2c3"},
    "sk":{"S":"NOTIF#2026-02-18T17:00:00Z#notif-333"},
    "entityType":{"S":"NOTIFICATION"},
    "notifId":{"S":"notif-333"},
    "userId":{"S":"a1b2c3"},
    "createdAt":{"S":"2026-02-18T17:00:00Z"},
    "data":{"M":{
      "title":{"S":"Transacción completada"},
      "body":{"S":"Tu pago fue procesado correctamente"}
    }}
  }'

echo "🎉 Seed completed successfully."