import { incrementDownload, getProduct, SUPER_ADMIN_USER, extractVisitInfo } from './utils/storage.js';
import { text } from './utils/response.js';

async function serveProduct(env, admin, product, request) {
  const prod = await getProduct(env.XIAZAI_KV, admin, product);
  if (!prod) return null;

  await incrementDownload(env.XIAZAI_KV, admin, product, extractVisitInfo(request));
  return text(prod.content || '', 200, {
    'Content-Disposition': `inline; filename="${product}.txt"`,
    'Cache-Control': 'no-cache',
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const pathname = new URL(request.url).pathname;

  if (request.method !== 'GET') return next();

  // 超级管理员 admin：根目录 /kuailian.txt
  const rootMatch = pathname.match(/^\/([a-zA-Z]+)\.txt$/);
  if (rootMatch) {
    const product = rootMatch[1].toLowerCase();
    const response = await serveProduct(env, SUPER_ADMIN_USER, product, request);
    if (response) return response;
    return next();
  }

  // 其他管理员：/zh/kuailian.txt
  const subMatch = pathname.match(/^\/([a-zA-Z]+)\/([a-zA-Z]+)\.txt$/);
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
