# DynamoDB Single Table Design + AWS Lambda API

Node.js · TypeScript · AWS SDK v3 · Vitest

Este proyecto implementa una API serverless sobre AWS Lambda + API Gateway respaldada por Amazon DynamoDB con Single Table Design. Cubre los cuatro access patterns del desafío técnico sin ningún Scan de tabla.

---

## Requisitos previos

- Node.js 20.x o superior
- npm 9.x o superior
- Una cuenta de AWS (solo necesaria para el deploy real)
- AWS CLI configurado con credenciales válidas (solo para deploy)

---

## Instalación y ejecución local

Primero, cloná el repositorio e instalá las dependencias:

```bash
git clone <repo-url>
cd dynamodb-lambda
npm install
```

Luego, copiá el archivo de variables de entorno de ejemplo y completá los valores:

```bash
cp .env.example .env
```

Con el archivo `.env` configurado, podés correr los tests:

```bash
npm run test
```

Para correr los tests en modo watch durante el desarrollo:

```bash
npm run test:watch
```

---

## Variables de entorno

El archivo `.env.example` documenta todas las variables necesarias. A continuación se explica el propósito de cada una:

```bash
# Nombre de la tabla DynamoDB. En producción este valor lo inyecta
# el framework de deploy (Serverless/SAM) automáticamente desde el stack.
TABLE_NAME=AppCore

# ID del User Pool de Cognito. Se obtiene desde la consola de AWS
# en Cognito > User Pools > <tu pool> > Overview.
# Formato: us-east-1_XXXXXXXXX
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX

# Client ID de la app registrada en el User Pool.
# Se obtiene desde Cognito > User Pools > <tu pool> > App clients.
COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
```

> **Nota de seguridad:** nunca commitees el archivo `.env` con valores reales. El `.gitignore` ya lo excluye. En producción, estas variables se configuran directamente en la consola de Lambda o se inyectan desde AWS Secrets Manager / SSM Parameter Store a través del framework de deploy.

---

## Estructura del proyecto

```
dynamodb-lambda/
├── src/
│   ├── handlers/               # Lambda entry points — un archivo por endpoint
│   │   ├── transactionsGet.ts
│   │   ├── transactionGetById.ts
│   │   ├── transactionsPost.ts
│   │   ├── transactionsGlobal.ts
│   │   └── notificationsGet.ts
│   ├── services/               # Lógica de negocio y acceso a DynamoDB
│   │   ├── auth.ts             # Validación JWT con aws-jwt-verify
│   │   ├── dynamoClient.ts     # Cliente DynamoDB compartido (singleton)
│   │   ├── transactions.ts     # Repositorio de transacciones
│   │   └── notifications.ts    # Repositorio de notificaciones
│   ├── types/
│   │   └── index.ts            # Tipos TypeScript compartidos
│   └── utils/
│       └── errors.ts           # Jerarquía de errores HTTP tipados
├── test/
│   ├── transactions.test.ts
│   └── transactionsPost.test.ts
├── docs/
│   └── Desafio_Tecnico_DynamoDB_Lambda.md   # Documento de diseño completo
├── .env.example
└── README.md
```

---

## Endpoints disponibles

Todos los endpoints requieren el header `Authorization: Bearer <token>` con un JWT válido emitido por el User Pool de Cognito configurado.

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/transactions` | Transacciones del usuario autenticado (paginadas) |
| GET | `/transactions/{id}` | Una transacción por ID, con validación de ownership |
| GET | `/transactions/global` | Últimas 10 transacciones del sistema (GSI1) |
| POST | `/transactions` | Crear una transacción nueva |
| GET | `/notifications` | Notificaciones del usuario, ordenadas por fecha descendente |

### Ejemplos de requests

**Listar transacciones del usuario autenticado:**
```bash
curl -X GET "https://<api-id>.execute-api.us-east-1.amazonaws.com/prod/transactions" \
  -H "Authorization: Bearer <token>"
```

**Obtener una transacción por ID:**
```bash
curl -X GET "https://<api-id>.execute-api.us-east-1.amazonaws.com/prod/transactions/tx-abc123" \
  -H "Authorization: Bearer <token>"
```

**Crear una transacción (con idempotencia):**
```bash
curl -X POST "https://<api-id>.execute-api.us-east-1.amazonaws.com/prod/transactions" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: <uuid-unico-por-request>" \
  -d '{ "amount": 500, "currency": "ARS" }'
```

El header `Idempotency-Key` es opcional pero recomendado. Si una request falla y se reintenta con la misma clave, el sistema devuelve la transacción original sin crear un duplicado.

**Listar notificaciones con paginación:**
```bash
# Primera página
curl -X GET "https://<api-id>.execute-api.us-east-1.amazonaws.com/prod/notifications?limit=10" \
  -H "Authorization: Bearer <token>"

# Página siguiente (usando el lastKey devuelto en la respuesta anterior)
curl -X GET "https://<api-id>.execute-api.us-east-1.amazonaws.com/prod/notifications?limit=10&lastKey=<encoded-key>" \
  -H "Authorization: Bearer <token>"
```

---

## Deploy en AWS

El proyecto está diseñado para deployarse con **Serverless Framework**. A continuación se muestra la configuración completa del `serverless.yml`:

```yaml
# serverless.yml
service: dynamodb-lambda

provider:
  name: aws
  runtime: nodejs20.x
  region: us-east-1
  environment:
    # TABLE_NAME se inyecta automáticamente desde el recurso creado más abajo,
    # evitando hardcodear el nombre de la tabla en el código.
    TABLE_NAME: !Ref AppCoreTable
    COGNITO_USER_POOL_ID: ${env:COGNITO_USER_POOL_ID}
    COGNITO_CLIENT_ID: ${env:COGNITO_CLIENT_ID}
  iam:
    role:
      statements:
        # Permisos mínimos necesarios sobre la tabla y sus GSIs.
        # El principio de least privilege aplica: no se otorgan permisos
        # de administración de tabla ni de Scan.
        - Effect: Allow
          Action:
            - dynamodb:GetItem
            - dynamodb:PutItem
            - dynamodb:Query
            - dynamodb:TransactWriteItems
          Resource:
            - !GetAtt AppCoreTable.Arn
            - !Sub "${AppCoreTable.Arn}/index/*"

functions:
  # Cada función corresponde a un handler individual.
  # Lambda escala cada una de forma independiente según su demanda.
  transactionsGet:
    handler: src/handlers/transactionsGet.handler
    events:
      - http:
          path: /transactions
          method: GET
          authorizer:
            type: COGNITO_USER_POOLS
            authorizerId: !Ref CognitoAuthorizer

  transactionGetById:
    handler: src/handlers/transactionGetById.handler
    events:
      - http:
          path: /transactions/{id}
          method: GET
          authorizer:
            type: COGNITO_USER_POOLS
            authorizerId: !Ref CognitoAuthorizer

  transactionsGlobal:
    handler: src/handlers/transactionsGlobal.handler
    events:
      - http:
          path: /transactions/global
          method: GET
          authorizer:
            type: COGNITO_USER_POOLS
            authorizerId: !Ref CognitoAuthorizer

  transactionsPost:
    handler: src/handlers/transactionsPost.handler
    # Reserved concurrency: garantiza que esta función siempre tenga
    # capacidad disponible y no sea desplazada por funciones de lectura.
    reservedConcurrency: 100
    events:
      - http:
          path: /transactions
          method: POST
          authorizer:
            type: COGNITO_USER_POOLS
            authorizerId: !Ref CognitoAuthorizer

  notificationsGet:
    handler: src/handlers/notificationsGet.handler
    events:
      - http:
          path: /notifications
          method: GET
          authorizer:
            type: COGNITO_USER_POOLS
            authorizerId: !Ref CognitoAuthorizer

resources:
  Resources:
    # Tabla principal con Single Table Design.
    AppCoreTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: AppCore
        BillingMode: PAY_PER_REQUEST   # On-Demand: sin necesidad de estimar capacidad
        AttributeDefinitions:
          - AttributeName: pk
            AttributeType: S
          - AttributeName: sk
            AttributeType: S
          - AttributeName: GSI1PK
            AttributeType: S
          - AttributeName: GSI1SK
            AttributeType: S
        KeySchema:
          - AttributeName: pk
            KeyType: HASH
          - AttributeName: sk
            KeyType: RANGE
        GlobalSecondaryIndexes:
          # GSI1 habilita el access pattern 4: últimas N transacciones globales.
          # GSI1PK = "GLOBAL_TX" (fijo), GSI1SK = createdAt (ISO 8601).
          - IndexName: GSI1
            KeySchema:
              - AttributeName: GSI1PK
                KeyType: HASH
              - AttributeName: GSI1SK
                KeyType: RANGE
            Projection:
              ProjectionType: ALL

    # Autorizador de Cognito reutilizado por todos los endpoints.
    CognitoAuthorizer:
      Type: AWS::ApiGateway::Authorizer
      Properties:
        Name: CognitoAuthorizer
        Type: COGNITO_USER_POOLS
        IdentitySource: method.request.header.Authorization
        RestApiId: !Ref ApiGatewayRestApi
        ProviderARNs:
          - !Sub "arn:aws:cognito-idp:us-east-1:${AWS::AccountId}:userpool/${env:COGNITO_USER_POOL_ID}"
```

### Pasos para deployar

Instalá Serverless Framework globalmente si aún no lo tenés:

```bash
npm install -g serverless
```

Configurá las variables sensibles como variables de entorno del sistema (no en `.env` para deploy):

```bash
export COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
export COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
```

Compilá el TypeScript y deployá:

```bash
npm run build
serverless deploy --stage prod
```

Al finalizar, Serverless imprime en consola la URL base de la API, por ejemplo:
```
endpoints:
  GET  - https://abc123.execute-api.us-east-1.amazonaws.com/prod/transactions
  GET  - https://abc123.execute-api.us-east-1.amazonaws.com/prod/transactions/{id}
  ...
```

Para destruir todos los recursos creados:

```bash
serverless remove --stage prod
```

---

## Diseño de la tabla DynamoDB

El documento completo de diseño, incluyendo el modelado Single Table, la definición de PK/SK/GSI, ejemplos de ítems y la justificación de todas las decisiones técnicas, está disponible en `docs/Desafio_Tecnico_DynamoDB_Lambda.md`.

Como referencia rápida, el esquema de claves es:

| Entidad | pk | sk |
|---|---|---|
| Usuario | `USER#<userId>` | `PROFILE` |
| Transacción (por usuario) | `USER#<userId>` | `TX#<timestamp>#<txId>` |
| Transacción (lookup por ID) | `TX#<txId>` | `METADATA` |
| Notificación | `USER#<userId>` | `NOTIF#<timestamp>#<notifId>` |
| Idempotencia | `IDE#<idempotencyKey>` | `METADATA` |

---

## Decisiones técnicas destacadas

**Single Table Design** permite resolver todos los access patterns con una sola Query o GetItem, sin JOINs ni múltiples round-trips a la red.

**TransactWrite atómico** en la creación de transacciones garantiza que los dos ítems necesarios (el del usuario y el lookup por ID) se escriben juntos o ninguno, evitando estados inconsistentes.

**aws-jwt-verify** verifica los tokens de Cognito localmente con JWKS cacheado, sin llamadas externas en el hot path de cada request.

**Paginación con LastEvaluatedKey** en todos los endpoints de listado garantiza consumo de memoria predecible independientemente del volumen de datos.

**Idempotencia con ConditionExpression** protege contra reintentos duplicados, especialmente relevante para clientes móviles con conectividad intermitente.
