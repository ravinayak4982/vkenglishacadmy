import CourseReview from '../../model/courseReviewModel.js';
import { listParams, listResult, safeRegex } from '../../utility/adminList.js';
import { success } from '../../utility/academyAuth.js';

export async function list(req, res) {
  const { page, limit, search, skip } = listParams(req);
  const query = req.query.status ? { status: req.query.status } : {};
  if (search) {
    const pattern = safeRegex(search);
    const matches = await CourseReview.find(query).populate({ path: 'user', match: { name: pattern } }).populate({ path: 'course', match: { title: pattern } });
    query._id = { $in: matches.filter((item) => item.user || item.course || pattern.test(item.comment)).map((item) => item._id) };
  }
  const [items, total] = await Promise.all([
    CourseReview.find(query).populate('user', 'name email avatar').populate('course', 'title grade').sort('-createdAt').skip(skip).limit(limit).lean(),
    CourseReview.countDocuments(query),
  ]);
  return success(res, 'Reviews fetched', listResult(items, total, page, limit));
}

export async function moderate(req, res) {
  if (!['approved', 'hidden'].includes(req.body.status)) return res.status(422).json({ success: false, message: 'Status must be approved or hidden', data: null });
  const item = await CourseReview.findByIdAndUpdate(req.params.id, { status: req.body.status, moderatedBy: req.user.id, moderatedAt: new Date() }, { new: true, runValidators: true })
    .populate('user', 'name email').populate('course', 'title grade');
  if (!item) return res.status(404).json({ success: false, message: 'Review not found', data: null });
  return success(res, `Review ${req.body.status}`, item);
}

export async function remove(req, res) {
  const item = await CourseReview.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Review not found', data: null });
  return success(res, 'Review deleted', { id: item.id });
}
