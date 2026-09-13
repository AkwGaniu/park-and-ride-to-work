import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

const headers = {
  'content-type': 'application/json',
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === 'GET' && event.rawPath === '/health') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: 'ok', service: 'park-and-ride-api' }),
    };
  }

  return {
    statusCode: 404,
    headers,
    body: JSON.stringify({ message: 'Route not found' }),
  };
};
