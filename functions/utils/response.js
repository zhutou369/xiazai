const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

export function text(content, status = 200, extraHeaders = {}) {
  return new Response(content, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      ...extraHeaders,
    },
  });
}

export function cors() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function unauthorized(msg = '未授权') {
  return json({ error: msg }, 401);
}

export function badRequest(msg) {
  return json({ error: msg }, 400);
}

export function notFound(msg = '未找到') {
  return json({ error: msg }, 404);
}

export function getToken(request) {
  const auth = request.headers.get('Authorization');
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return null;
}
