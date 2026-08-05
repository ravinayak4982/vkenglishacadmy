import Course from '../../model/courseModel.js';
import CourseReview from '../../model/courseReviewModel.js';
import Payment from '../../model/paymentModel.js';
import { notifyAdmins } from '../../services/notificationService.js';
import { success } from '../../utility/academyAuth.js';

export async function list(req, res) {
  const course = await Course.exists({ _id: req.params.courseId, isPublished: true });
  if (!course) return res.status(404).json({ success: false, message: 'Course not found', data: null });
  const items = await CourseReview.find({ course: req.params.courseId, status: 'approved' })
    .populate('user', 'name avatar studentClass').sort('-createdAt').limit(100).lean();
  return success(res, 'Reviews fetched', items);
}

export async function save(req, res) {
  const rating = Number(req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(422).json({ success: false, message: 'Rating must be between 1 and 5', data: null });
  const course = await Course.findOne({ _id: req.params.courseId, isPublished: true }).select('title');
  if (!course) return res.status(404).json({ success: false, message: 'Course not found', data: null });
  const purchased = await Payment.exists({ user: req.user.id, course: course.id, status: 'approved', $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
  if (!purchased) return res.status(403).json({ success: false, message: 'Only subscribed students can review this course', data: null });
  const item = await CourseReview.findOneAndUpdate(
    { course: course.id, user: req.user.id },
    { rating, comment: req.body.comment?.trim() || '', status: 'pending', moderatedBy: null, moderatedAt: null },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  await notifyAdmins(req.app, { title: 'Course review awaiting approval', body: `${req.user.name} rated ${course.title} ${rating}/5.`, type: 'review', data: { reviewId: item.id, courseId: course.id } });
  return success(res, 'Review submitted for approval', item, 201);
}
