import Faq from '../../model/faqModel.js';
import { success } from '../../utility/academyAuth.js';
import { listParams, listResult, safeRegex } from '../../utility/adminList.js';

export async function list(req, res) {
  const { page, limit, search, skip } = listParams(req);
  const pattern = search ? safeRegex(search) : null;
  const query = pattern ? { $or: [{ question: pattern }, { answer: pattern }] } : {};
  const [items, total] = await Promise.all([
    Faq.find(query).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(limit),
    Faq.countDocuments(query),
  ]);
  return success(res, 'FAQs fetched', listResult(items, total, page, limit));
}
export async function create(req, res) {
  const item = await Faq.create(req.body);
  return success(res, 'FAQ created', item, 201);
}
export async function update(req, res) {
  const item = await Faq.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!item) return res.status(404).json({ success: false, message: 'FAQ not found', data: null });
  return success(res, 'FAQ updated', item);
}
export async function remove(req, res) {
  const item = await Faq.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'FAQ not found', data: null });
  return success(res, 'FAQ deleted');
}
