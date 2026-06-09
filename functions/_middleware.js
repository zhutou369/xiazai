import { incrementDownload, getProduct, SUPER_ADMIN_USER, extractVisitInfo } from './utils/storage.js';
import { text } from './utils/response.js';

async function serveProduct(env, admin, product, request) {
  const prod = await getProduct(env.XIAZAI_KV, admin, product);
  if (!prod) return null;

  await incrementDownload(env.XIAZAI_KV, admin, product, extractVisitInfo(request));
  return text(prod.content || '', 200, {
    'Content-Disposition': `inline; filename="${product}.txt"`,
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  });
}

function decodePathname(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const pathname = decodePathname(new URL(request.url).pathname);

  if (pathname === '/assets' || pathname.startsWith('/assets/')) {
    return text('Not Found', 404);
  }

  if (request.method === 'OPTIONS' && /\.txt$/.test(pathname)) {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (request.method !== 'GET') return next();

  // 超级管理员 admin：根目录 /产品名.txt
  const rootMatch = pathname.match(/^\/([^/]+)\.txt$/);
  if (rootMatch) {
    const product = rootMatch[1].toLowerCase();
    const response = await serveProduct(env, SUPER_ADMIN_USER, product, request);
    if (response) return response;
    return next();
  }

  // 其他管理员：/zh/产品名.txt
  const subMatch = pathname.match(/^\/([a-zA-Z]+)\/([^/]+)\.txt$/);
  if (subMatch) {
    const admin = subMatch[1].toLowerCase();
    const product = subMatch[2].toLowerCase();
    if (admin === SUPER_ADMIN_USER) return next();

    const response = await serveProduct(env, admin, product, request);
    if (response) return response;
    return text('文件不存在', 404);
  }

  return next();
}
