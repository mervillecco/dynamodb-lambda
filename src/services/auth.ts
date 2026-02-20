import { CognitoJwtVerifier } from 'aws-jwt-verify';

function getVerifier() {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;

  if (!userPoolId || !clientId) {
    throw new Error('Missing Cognito environment variables');
  }

  return CognitoJwtVerifier.create({
    userPoolId,
    clientId,
    tokenUse: 'access',
  });
}

export async function validateToken(authHeader?: string) {
  if (!authHeader) throw new Error('Missing Authorization header');

  const token = authHeader.replace(/^Bearer\s+/i, '');
  const verifier = getVerifier();

  const payload = await verifier.verify(token);
  return payload;
}
