import {
  initDefaultAdmin, findAdmin, getAdmins, saveAdmins,
  getProductList, saveProductList, getProduct, saveProduct, deleteProduct,
  getStats, createSession, getSession, deleteSession, isValidName,
  getAdminDir, getProductUrl, SUPER_ADMIN_USER, getDownloadLogs, summarizeLogs, getToday
} from '../utils/storage.js';
import { json, cors, unauthorized, badRequest, notFound, getToken } from '../utils/response.js';

async function requireAuth(env, request) {
  const token = getToken(request);
  const session = await getSession(env.XIAZAI_KV, token);
  if (!session) return null;
  const admin = await findAdmin(env.XIAZAI_KV, session.username);
  return admin || null;
}

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') return cors();

  await initDefaultAdmin(env.XIAZAI_KV, env);

  const route = (params.path || []).join('/');
  const url = new URL(request.url);

  try {
    if (route === 'login' && request.method === 'POST') {
      const body = await request.json();
      const { username, password } = body;
      if (!username || !password) return badRequest('请输入用户名和密码');

      const admin = await findAdmin(env.XIAZAI_KV, username);
      if (!admin || admin.password !== password) {
        return unauthorized('用户名或密码错误');
      }

      const token = await createSession(env.XIAZAI_KV, admin.username);
      return json({
        token,
        username: admin.username,
        isSuper: !!admin.isSuper,
        adminUrl: getAdminDir(admin.username)
      });
    }

    if (route === 'logout' && request.method === 'POST') {
      const token = getToken(request);
      await deleteSession(env.XIAZAI_KV, token);
      return json({ success: true });
    }

    if (route === 'me' && request.method === 'GET') {
      const admin = await requireAuth(env, request);
      if (!admin) return unauthorized();
      return json({
        username: admin.username,
        isSuper: !!admin.isSuper,
        adminUrl: getAdminDir(admin.username)
      });
    }

    if (route === 'admins') {
      const admin = await requireAuth(env, request);
      if (!admin) return unauthorized();
      if (!admin.isSuper) return unauthorized('仅超级管理员可操作');

      if (request.method === 'GET') {
        const admins = await getAdmins(env.XIAZAI_KV);
        return json(admins.map(a => ({
          username: a.username,
          isSuper: !!a.isSuper,
          createdAt: a.createdAt,
          url: getAdminDir(a.username)
        })));
      }

      if (request.method === 'POST') {
        const body = await request.json();
        const { username, password } = body;
        if (!username || !password) return badRequest('请输入管理员名称和密码');
        if (!isValidName(username)) return badRequest('管理员名称只能包含字母');
        if (username.toLowerCase() === 'api') return badRequest('该名称不可用');
        if (username.toLowerCase() === SUPER_ADMIN_USER) return badRequest('admin 为超级管理员专用名称，目录固定为根目录');

        const admins = await getAdmins(env.XIAZAI_KV);
        if (admins.find(a => a.username.toLowerCase() === username.toLowerCase())) {
          return badRequest('管理员已存在');
        }

        admins.push({
          username: username.toLowerCase(),
          password,
          isSuper: false,
          createdAt: new Date().toISOString()
        });
        await saveAdmins(env.XIAZAI_KV, admins);
        await saveProductList(env.XIAZAI_KV, username.toLowerCase(), []);

        return json({
          success: true,
          username: username.toLowerCase(),
          url: `/${username.toLowerCase()}/`
        });
      }

      if (request.method === 'DELETE') {
        const username = url.searchParams.get('username');
        if (!username) return badRequest('请指定管理员');
        if (username.toLowerCase() === admin.username.toLowerCase()) {
          return badRequest('不能删除自己');
        }

        const admins = await getAdmins(env.XIAZAI_KV);
        const target = admins.find(a => a.username.toLowerCase() === username.toLowerCase());
        if (!target) return notFound('管理员不存在');
        if (target.isSuper) return badRequest('不能删除超级管理员');

        const products = await getProductList(env.XIAZAI_KV, username);
        for (const p of products) {
          await deleteProduct(env.XIAZAI_KV, username, p);
        }

        await saveAdmins(env.XIAZAI_KV, admins.filter(a => a.username.toLowerCase() !== username.toLowerCase()));
        return json({ success: true });
      }
    }

    if (route === 'products') {
      const admin = await requireAuth(env, request);
      if (!admin) return unauthorized();

      const targetAdmin = url.searchParams.get('admin') || admin.username;

      if (request.method === 'GET') {
        const products = await getProductList(env.XIAZAI_KV, targetAdmin);
        const result = [];
        for (const name of products) {
          const prod = await getProduct(env.XIAZAI_KV, targetAdmin, name);
          const stats = await getStats(env.XIAZAI_KV, targetAdmin, name);
          result.push({
            name,
            content: prod?.content || '',
            url: getProductUrl(targetAdmin, name),
            stats
          });
        }
        result.sort((a, b) => (b.stats.today || 0) - (a.stats.today || 0));
        return json(result);
      }

      if (request.method === 'POST') {
        const body = await request.json();
        const { name, content = '' } = body;
        if (!name) return badRequest('请输入产品名称');
        if (!isValidName(name)) return badRequest('产品名称只能包含字母');

        const lowerName = name.toLowerCase();
        const list = await getProductList(env.XIAZAI_KV, admin.username);
        if (list.includes(lowerName)) return badRequest('产品已存在');

        list.push(lowerName);
        await saveProductList(env.XIAZAI_KV, admin.username, list);
        await saveProduct(env.XIAZAI_KV, admin.username, lowerName, {
          name: lowerName,
          content,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        return json({
          success: true,
          name: lowerName,
          url: getProductUrl(admin.username, lowerName)
        });
      }

      if (request.method === 'PUT') {
        const body = await request.json();
        const { oldName, newName, content } = body;
        if (!oldName) return badRequest('请指定产品');

        const lowerOld = oldName.toLowerCase();
        const list = await getProductList(env.XIAZAI_KV, admin.username);
        if (!list.includes(lowerOld)) return notFound('产品不存在');

        if (newName && newName.toLowerCase() !== lowerOld) {
          if (!isValidName(newName)) return badRequest('产品名称只能包含字母');
          const lowerNew = newName.toLowerCase();
          if (list.includes(lowerNew)) return badRequest('目标产品名已存在');

          const prod = await getProduct(env.XIAZAI_KV, admin.username, lowerOld);
          const stats = await getStats(env.XIAZAI_KV, admin.username, lowerOld);

          await saveProduct(env.XIAZAI_KV, admin.username, lowerNew, {
            ...prod,
            name: lowerNew,
            content: content !== undefined ? content : prod?.content || '',
            updatedAt: new Date().toISOString()
          });

          const statsKey = `stats:${admin.username.toLowerCase()}:${lowerOld}`;
          const statsData = await env.XIAZAI_KV.get(statsKey, 'json');
          if (statsData) {
            await env.XIAZAI_KV.put(`stats:${admin.username.toLowerCase()}:${lowerNew}`, JSON.stringify(statsData));
            await env.XIAZAI_KV.delete(statsKey);
          }

          await deleteProduct(env.XIAZAI_KV, admin.username, lowerOld);
          const newList = list.filter(p => p !== lowerOld);
          newList.push(lowerNew);
          await saveProductList(env.XIAZAI_KV, admin.username, newList);

          return json({ success: true, name: lowerNew });
        }

        const prod = await getProduct(env.XIAZAI_KV, admin.username, lowerOld);
        await saveProduct(env.XIAZAI_KV, admin.username, lowerOld, {
          ...prod,
          content: content !== undefined ? content : prod?.content || '',
          updatedAt: new Date().toISOString()
        });
        return json({ success: true, name: lowerOld });
      }

      if (request.method === 'DELETE') {
        const name = url.searchParams.get('name');
        if (!name) return badRequest('请指定产品');
        await deleteProduct(env.XIAZAI_KV, admin.username, name);
        return json({ success: true });
      }
    }

    if (route === 'download-logs' && request.method === 'GET') {
      const admin = await requireAuth(env, request);
      if (!admin) return unauthorized();

      const product = url.searchParams.get('product');
      const date = url.searchParams.get('date') || getToday();
      if (!product) return badRequest('请指定产品');

      const list = await getProductList(env.XIAZAI_KV, admin.username);
      if (!list.includes(product.toLowerCase())) return notFound('产品不存在');

      const logs = await getDownloadLogs(env.XIAZAI_KV, admin.username, product, date);
      const { referrerStats, regionStats } = summarizeLogs(logs);

      return json({
        date,
        product: product.toLowerCase(),
        total: logs.length,
        logs,
        referrerStats,
        regionStats,
      });
    }

    if (route === 'change-password' && request.method === 'POST') {
      const admin = await requireAuth(env, request);
      if (!admin) return unauthorized();
      const body = await request.json();
      const { oldPassword, newPassword } = body;
      if (!oldPassword || !newPassword) return badRequest('请输入密码');
      if (admin.password !== oldPassword) return badRequest('原密码错误');

      const admins = await getAdmins(env.XIAZAI_KV);
      const idx = admins.findIndex(a => a.username.toLowerCase() === admin.username.toLowerCase());
      admins[idx].password = newPassword;
      await saveAdmins(env.XIAZAI_KV, admins);
      return json({ success: true });
    }

    return notFound('接口不存在');
  } catch (err) {
    return json({ error: err.message || '服务器错误' }, 500);
  }
}
