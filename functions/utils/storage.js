const ADMINS_KEY = 'config:admins';
const SESSION_PREFIX = 'session:';
const PRODUCT_PREFIX = 'product:';
const STATS_PREFIX = 'stats:';
const LOGS_PREFIX = 'logs:';
const DEDUP_PREFIX = 'dedup:';
const MAX_DAILY_LOGS = 1000;

export const SUPER_ADMIN_USER = 'admin';

export function isValidName(name) {
  return /^[a-zA-Z]+$/.test(name);
}

export function isValidProductName(name) {
  const n = name?.trim();
  if (!n || n.length > 128) return false;
  if (n === '.' || n === '..') return false;
  return !/[\/\\]/.test(n);
}

export function normalizeProductName(name) {
  return name.trim().toLowerCase();
}

export function encodeProductSegment(name) {
  return encodeURIComponent(name);
}

export function isSuperAdminUser(username) {
  return username.toLowerCase() === SUPER_ADMIN_USER;
}

/** 超级管理员 admin 固定使用根目录 / */
export function getAdminDir(username) {
  return isSuperAdminUser(username) ? '/' : `/${username.toLowerCase()}/`;
}

/** 超级管理员产品: /kuailian.txt，其他管理员: /zh/kuailian.txt */
export function getProductUrl(username, product) {
  const seg = encodeProductSegment(product);
  return isSuperAdminUser(username) ? `/${seg}.txt` : `/${username.toLowerCase()}/${seg}.txt`;
}

export function getToday() {
  return new Date().toISOString().slice(0, 10);
}

export function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function getAdmins(kv) {
  const data = await kv.get(ADMINS_KEY, 'json');
  return data || [];
}

export async function saveAdmins(kv, admins) {
  await kv.put(ADMINS_KEY, JSON.stringify(admins));
}

export async function initDefaultAdmin(kv, env) {
  const admins = await getAdmins(kv);
  if (admins.length === 0) {
    const defaultUser = env.DEFAULT_ADMIN_USER || 'admin';
    const defaultPass = env.DEFAULT_ADMIN_PASS || 'admin123';
    await saveAdmins(kv, [{
      username: defaultUser,
      password: defaultPass,
      isSuper: true,
      createdAt: new Date().toISOString()
    }]);
  }
}

export async function findAdmin(kv, username) {
  const admins = await getAdmins(kv);
  return admins.find(a => a.username.toLowerCase() === username.toLowerCase());
}

export function productKey(admin, product) {
  return `${PRODUCT_PREFIX}${admin.toLowerCase()}:${product.toLowerCase()}`;
}

export function statsKey(admin, product) {
  return `${STATS_PREFIX}${admin.toLowerCase()}:${product.toLowerCase()}`;
}

export function logsKey(admin, product, date) {
  return `${LOGS_PREFIX}${admin.toLowerCase()}:${product.toLowerCase()}:${date}`;
}

export function dedupKey(admin, product, clientId) {
  return `${DEDUP_PREFIX}${admin.toLowerCase()}:${product.toLowerCase()}:${clientId}`;
}

export function getClientId(request) {
  const ip = request.headers.get('CF-Connecting-IP')
    || request.headers.get('True-Client-IP')
    || request.headers.get('X-Real-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim();
  if (ip) return ip;
  const ua = request.headers.get('User-Agent') || 'unknown';
  return `fp:${ua.slice(0, 120)}`;
}

export function extractVisitInfo(request) {
  const cf = request.cf || {};
  const referrer = request.headers.get('Referer') || request.headers.get('Referrer') || '';
  const parts = [cf.country, cf.region || cf.regionCode, cf.city].filter(Boolean);
  const clientId = getClientId(request);

  return {
    time: new Date().toISOString(),
    referrer: referrer || '直接访问',
    ip: clientId.startsWith('fp:') ? '未知' : clientId,
    clientId,
    country: cf.country || '未知',
    region: cf.region || cf.regionCode || '',
    city: cf.city || '',
    location: parts.length ? parts.join(' / ') : '未知',
  };
}

export async function hasIpDownloaded(kv, admin, product, clientId) {
  if (!clientId) return false;
  return !!(await kv.get(dedupKey(admin, product, clientId)));
}

export async function getProductList(kv, admin) {
  const list = await kv.get(`list:${admin.toLowerCase()}`, 'json');
  return list || [];
}

export async function saveProductList(kv, admin, list) {
  await kv.put(`list:${admin.toLowerCase()}`, JSON.stringify(list));
}

export async function getProduct(kv, admin, product) {
  return await kv.get(productKey(admin, product), 'json');
}

export async function saveProduct(kv, admin, product, data) {
  await kv.put(productKey(admin, product), JSON.stringify(data));
}

export async function deleteProduct(kv, admin, product) {
  await kv.delete(productKey(admin, product));
  await kv.delete(statsKey(admin, product));
  const list = await getProductList(kv, admin);
  const filtered = list.filter(p => p !== product.toLowerCase());
  await saveProductList(kv, admin, filtered);
}

export async function appendDownloadLog(kv, admin, product, visitInfo) {
  const today = getToday();
  const key = logsKey(admin, product, today);
  const raw = await kv.get(key, 'json');
  const logs = Array.isArray(raw) ? raw : [];
  const clientId = visitInfo.clientId || visitInfo.ip;
  if (logs.some(log => log.clientId === clientId || log.ip === visitInfo.ip)) return;
  logs.unshift(visitInfo);
  if (logs.length > MAX_DAILY_LOGS) logs.length = MAX_DAILY_LOGS;
  await kv.put(key, JSON.stringify(logs));
}

export async function getDownloadLogs(kv, admin, product, date) {
  const key = logsKey(admin, product, date || getToday());
  return await kv.get(key, 'json') || [];
}

export function summarizeLogs(logs) {
  const referrerMap = {};
  const regionMap = {};

  for (const log of logs) {
    const ref = log.referrer || '直接访问';
    referrerMap[ref] = (referrerMap[ref] || 0) + 1;

    const loc = log.location || '未知';
    if (!regionMap[loc]) regionMap[loc] = { location: loc, ips: {}, count: 0 };
    regionMap[loc].count += 1;
    const ip = log.ip || '未知';
    regionMap[loc].ips[ip] = (regionMap[loc].ips[ip] || 0) + 1;
  }

  const referrerStats = Object.entries(referrerMap)
    .map(([referrer, count]) => ({ referrer, count }))
    .sort((a, b) => b.count - a.count);

  const regionStats = Object.values(regionMap)
    .map(r => ({
      location: r.location,
      count: r.count,
      ips: Object.entries(r.ips).map(([ip, count]) => ({ ip, count })).sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count);

  return { referrerStats, regionStats };
}

export async function getStats(kv, admin, product) {
  const stats = await kv.get(statsKey(admin, product), 'json');
  const today = getToday();
  const yesterday = getYesterday();
  if (!stats) {
    return { today: 0, yesterday: 0, total: 0, todayDate: today };
  }
  let todayCount = stats.todayDate === today ? stats.today : 0;
  let yesterdayCount = stats.yesterdayDate === yesterday ? stats.yesterday : (stats.todayDate === yesterday ? stats.today : 0);
  return {
    today: todayCount,
    yesterday: yesterdayCount,
    total: stats.total || 0,
    todayDate: today
  };
}

export async function incrementDownload(kv, admin, product, visitInfo = null) {
  const clientId = visitInfo?.clientId || visitInfo?.ip;
  if (!clientId) {
    return await getStats(kv, admin, product);
  }

  if (await hasIpDownloaded(kv, admin, product, clientId)) {
    return await getStats(kv, admin, product);
  }

  // 先写入去重标记，防止快速刷新时重复计数
  await kv.put(dedupKey(admin, product, clientId), JSON.stringify({ t: Date.now() }));

  const key = statsKey(admin, product);
  const today = getToday();
  const yesterday = getYesterday();
  let stats = await kv.get(key, 'json');

  if (!stats) {
    stats = { today: 0, yesterday: 0, total: 0, todayDate: today, yesterdayDate: yesterday };
  }

  if (stats.todayDate !== today) {
    if (stats.todayDate === yesterday) {
      stats.yesterday = stats.today;
      stats.yesterdayDate = yesterday;
    } else {
      stats.yesterday = 0;
      stats.yesterdayDate = yesterday;
    }
    stats.today = 0;
    stats.todayDate = today;
  }

  stats.today += 1;
  stats.total = (stats.total || 0) + 1;

  try {
    await kv.put(key, JSON.stringify(stats));
    if (visitInfo) await appendDownloadLog(kv, admin, product, visitInfo);
  } catch (_) {
    // 统计写入失败不阻断下载
  }
  return stats;
}

export async function createSession(kv, username) {
  const token = crypto.randomUUID();
  await kv.put(`${SESSION_PREFIX}${token}`, JSON.stringify({
    username,
    createdAt: Date.now()
  }), { expirationTtl: 86400 * 7 });
  return token;
}

export async function getSession(kv, token) {
  if (!token) return null;
  return await kv.get(`${SESSION_PREFIX}${token}`, 'json');
}

export async function deleteSession(kv, token) {
  if (token) await kv.delete(`${SESSION_PREFIX}${token}`);
}
