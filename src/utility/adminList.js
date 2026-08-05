export function listParams(req, defaultLimit = 10) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || defaultLimit));
  const search = req.query.search?.trim() || '';
  return { page, limit, search, skip: (page - 1) * limit };
}

export function safeRegex(value) {
  return new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

export function listResult(items, total, page, limit) {
  return { items, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}
