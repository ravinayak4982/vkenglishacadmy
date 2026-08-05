import Payment from '../../model/paymentModel.js';
import { sendMail } from '../../services/mailService.js';
import { notifyUser } from '../../services/notificationService.js';
import { success } from '../../utility/academyAuth.js';
import AcademyUser from '../../model/academyUserModel.js';
import Course from '../../model/courseModel.js';
import { listParams, listResult, safeRegex } from '../../utility/adminList.js';

export async function list(req, res) {
  const { page, limit, search, skip } = listParams(req);
  const query = req.query.status ? { status: req.query.status } : {};
  if (search) {
    const pattern = safeRegex(search);
    const [users, courses] = await Promise.all([
      AcademyUser.find({ role: 'user', $or: [{ name: pattern }, { email: pattern }] }).distinct('_id'),
      Course.find({ $or: [{ title: pattern }, { grade: pattern }] }).distinct('_id'),
    ]);
    query.$or = [{ transactionId: pattern }, { user: { $in: users } }, { course: { $in: courses } }];
  }
  const [items, total] = await Promise.all([Payment.find(query).populate('user', 'name email phone').populate('course','title grade').sort('-createdAt').skip((page - 1) * limit).limit(limit), Payment.countDocuments(query)]);
  return success(res, 'Payments fetched', listResult(items, total, page, limit));
}
export async function review(req, res) {
  if (!['approved', 'rejected'].includes(req.body.status)) return res.status(422).json({ success: false, message: 'Status must be approved or rejected', data: null });
  const reviewedAt = new Date();
  const accessDays = Math.min(1095, Math.max(1, Number(req.body.accessDays) || 365));
  const expiresAt = new Date(reviewedAt.getTime() + accessDays * 86400000);
  const payment = await Payment.findByIdAndUpdate(req.params.id, {
    status: req.body.status,
    remark: '',
    reviewedBy: req.user.id,
    reviewedAt,
    ...(req.body.status === 'approved' ? { subscriptionStartedAt: reviewedAt, expiresAt, expiryReminderDays: [] } : {}),
  }, { new: true })
    .populate('user', 'name email')
    .populate('course', 'title grade');
  if (!payment) return res.status(404).json({ success: false, message: 'Payment not found', data: null });
  const approved = req.body.status === 'approved';
  const courseTitle = payment.course?.title || 'your selected course';
  const title = approved ? 'Payment approved - Course activated' : 'Payment proof rejected';
  const standardMessage = approved
    ? `Your payment proof of INR ${payment.amount} for ${courseTitle} has been approved. The course is now active in My Courses.`
    : `Your payment proof of INR ${payment.amount} for ${courseTitle} has been rejected. Please check the payment details and submit a valid screenshot again.`;
  const body = standardMessage;
  await notifyUser(req.app, payment.user._id, {
    title,
    body,
    type: 'payment',
    data: { paymentId: payment.id, courseId: payment.course?._id, status: req.body.status, expiresAt: payment.expiresAt },
  });
  await sendMail({ to: payment.user.email, subject: title, text: body }).catch(() => null);
  return success(res, title, payment);
}
