import Payment from '../../model/paymentModel.js';
import Notification from '../../model/academyNotificationModel.js';
import Setting from '../../model/settingModel.js';
import Course from '../../model/courseModel.js';
import AcademyClass from '../../model/academyClassModel.js';
import AcademyUser from '../../model/academyUserModel.js';
import ChatMessage from '../../model/chatMessageModel.js';
import Faq from '../../model/faqModel.js';
import VideoLike from '../../model/videoLikeModel.js';
import VideoProgress from '../../model/videoProgressModel.js';
import CourseReview from '../../model/courseReviewModel.js';
import { notifyAdmins, notifyUser } from '../../services/notificationService.js';
import { runSubscriptionExpiryReminders } from '../../services/subscriptionReminderService.js';
import { success, userData } from '../../utility/academyAuth.js';

export async function profile(req, res) {
  const purchasedIds = await Payment.distinct('course', { user: req.user.id, status: 'approved', $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
  const purchased = await Course.find({ _id: { $in: purchasedIds } }).select('videos documents').lean();
  const stats = purchased.reduce((value, item) => ({
    courses: value.courses + 1,
    videos: value.videos + (item.videos?.length || 0),
    pdfs: value.pdfs + (item.documents?.length || 0),
  }), { courses: 0, videos: 0, pdfs: 0 });
  return success(res, 'Profile fetched', { ...userData(req.user), stats });
}
export async function updateProfile(req, res) {
  const name = req.body.name?.trim();
  const email = req.body.email?.trim().toLowerCase();
  if (!name || !email) return res.status(422).json({ success: false, message: 'Name and email are required', data: null });
  const duplicate = await AcademyUser.exists({ _id: { $ne: req.user._id }, email });
  if (duplicate) return res.status(409).json({ success: false, message: 'Email is already used by another account', data: null });
  req.user.name = name;
  req.user.email = email;
  req.user.phone = req.body.phone?.trim() || '';
  req.user.studentClass = req.body.studentClass?.trim() || '';
  if (req.file) req.user.avatar = `/uploads/profile/${req.file.filename}`;
  await req.user.save();
  return success(res, 'Profile updated', userData(req.user));
}
export async function updatePreferences(req, res) {
  req.user.notificationsEnabled = req.body.notificationsEnabled === true;
  await req.user.save();
  return success(res, 'Preferences updated', userData(req.user));
}
export async function settings(req, res) { return success(res, 'Settings fetched', await Setting.findOneAndUpdate({ key: 'application' }, { $setOnInsert: { key: 'application' } }, { upsert: true, new: true })); }
export async function classes(req,res) { return success(res,'Classes fetched',await AcademyClass.find({isActive:true}).select('name sortOrder').sort({sortOrder:1,name:1}).lean()); }
export async function faqs(req,res) { return success(res,'FAQs fetched',await Faq.find({isActive:true}).select('question answer sortOrder').sort({sortOrder:1,createdAt:1}).lean()); }
export async function courses(req, res) {
  const items = await Course.find({ isPublished: true }).sort({ sortOrder: 1, createdAt: -1 }).lean();
  const reviewStats = await CourseReview.aggregate([
    { $match: { course: { $in: items.map((item) => item._id) }, status: 'approved' } },
    { $group: { _id: '$course', average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const reviewsByCourse = new Map(reviewStats.map((item) => [String(item._id), item]));
  const withReviews = (course) => ({
    ...course,
    rating: Number((reviewsByCourse.get(String(course._id))?.average || 0).toFixed(1)),
    reviewCount: reviewsByCourse.get(String(course._id))?.count || 0,
  });
  if (!req.user) {
    return success(res, 'Courses fetched', items.map((course) => ({ ...withReviews(course), isPurchased: false, progress: 0 })));
  }
  const [purchased, progressItems] = await Promise.all([
    Payment.find({ user: req.user.id, status: 'approved', $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }).select('course expiresAt').lean(),
    VideoProgress.find({ user: req.user.id, course: { $in: items.map((course) => course._id) } }).lean(),
  ]);
  const purchasedIds = new Set(purchased.map((item) => String(item.course)));
  const expiryByCourse = new Map(purchased.map((item) => [String(item.course), item.expiresAt]));
  const progressByVideo = new Map(progressItems.map((item) => [
    `${item.course}:${item.videoId}`,
    item,
  ]));
  const coursesWithProgress = items.map((course) => {
    const videoProgress = (course.videos || []).map((video) => {
      const item = progressByVideo.get(`${course._id}:${video._id}`);
      if (!item) return 0;
      if (item.completed) return 1;
      if (!item.durationSeconds) return 0;
      return Math.min(1, Math.max(item.watchedSeconds, item.lastPositionSeconds) / item.durationSeconds);
    });
    const progress = videoProgress.length
      ? videoProgress.reduce((total, value) => total + value, 0) / videoProgress.length
      : 0;
    return {
      ...withReviews(course),
      isPurchased: purchasedIds.has(String(course._id)),
      subscriptionExpiresAt: expiryByCourse.get(String(course._id)) || null,
      progress: Number(progress.toFixed(4)),
    };
  });
  return success(res, 'Courses fetched', coursesWithProgress);
}
export async function search(req, res) {
  const q = req.query.q?.trim();
  if (!q || q.length < 2) return success(res, 'Search results', []);
  const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const courses = await Course.find({ isPublished: true, $or: [
    { title: pattern }, { grade: pattern }, { description: pattern },
    { 'videos.title': pattern }, { 'videos.topic': pattern },
    { 'documents.title': pattern }, { 'documents.topic': pattern },
  ] }).sort({ sortOrder: 1, createdAt: -1 }).limit(30).lean();
  const purchased = new Set((await Payment.distinct('course', { user: req.user.id, status: 'approved', $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] })).map(String));
  const results = courses.flatMap((course) => {
    const base = { courseId: course._id, courseTitle: course.title, grade: course.grade, image: course.image, color: course.color, isPurchased: purchased.has(String(course._id)) };
    const items = [];
    if (pattern.test(`${course.title} ${course.grade} ${course.description}`)) items.push({ ...base, type: 'course', id: course._id, title: course.title, subtitle: course.description });
    for (const video of course.videos || []) if (pattern.test(`${video.title} ${video.topic}`)) items.push({ ...base, type: 'video', id: video._id, title: video.title, subtitle: video.topic, resource: video });
    for (const document of course.documents || []) if (pattern.test(`${document.title} ${document.topic}`)) items.push({ ...base, type: 'pdf', id: document._id, title: document.title, subtitle: document.topic, resource: document });
    return items;
  });
  return success(res, 'Search results', results.slice(0, 60));
}
export async function submitPayment(req, res) {
  if (!req.file) return res.status(422).json({ success: false, message: 'Payment screenshot is required', data: null });
  if (!Number.isFinite(Number(req.body.amount)) || Number(req.body.amount) < 1) return res.status(422).json({ success: false, message: 'A valid payment amount is required', data: null });
  const course = await Course.findOne({ _id: req.body.courseId, isPublished: true });
  if (!course) return res.status(404).json({ success: false, message: 'Course not found', data: null });
  const pending = await Payment.exists({ user: req.user.id, course: course.id, status: 'pending' });
  if (pending) return res.status(409).json({ success: false, message: 'A payment request for this course is already pending', data: null });
  const transactionId = `APP-${Date.now()}-${String(req.user.id).slice(-6).toUpperCase()}`;
  const payment = await Payment.create({ user: req.user.id, course: course.id, screenshot: `/uploads/payment/${req.file.filename}`, amount: Number(req.body.amount), transactionId });
  await Promise.all([
    notifyUser(req.app, req.user.id, { title: 'Payment proof submitted', body: `Your payment proof for ${course.title} is pending admin verification.`, type: 'payment', data: { paymentId: payment.id, courseId: course.id } }),
    notifyAdmins(req.app, {
      title: 'New course purchase request',
      body: `${req.user.name} sent an INR ${payment.amount} request for ${course.title}.`,
      type: 'payment_request',
      data: { paymentId: payment.id, courseId: course.id, userId: req.user.id, amount: payment.amount },
    }),
  ]);
  return success(res, 'Payment submitted for verification', payment, 201);
}
export async function payments(req, res) { return success(res, 'Payments fetched', await Payment.find({ user: req.user.id }).sort('-createdAt')); }
export async function notifications(req, res) {
  if (req.user.notificationsEnabled) await runSubscriptionExpiryReminders(req.app, req.user.id);
  return success(res, 'Notifications fetched', req.user.notificationsEnabled ? await Notification.find({ user: req.user.id }).sort('-createdAt').limit(100) : []);
}
export async function completeDailyGoal(req, res) {
  const seconds = Math.max(0, Number(req.body.seconds) || 0);
  const goalDate = req.body.goalDate?.toString();
  if (seconds < 7200) return res.status(422).json({ success: false, message: 'Complete the 2 hour goal first', data: null });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(goalDate || '')) return res.status(422).json({ success: false, message: 'A valid goal date is required', data: null });
  const existing = await Notification.findOne({ user: req.user.id, type: 'achievement', 'data.goalDate': goalDate });
  if (existing) return success(res, 'Daily goal already recorded', { notification: existing, created: false });
  if (req.user.notificationsEnabled === false) return success(res, 'Daily goal completed', { notification: null, created: false });
  const item = await Notification.create({
    user: req.user.id,
    title: 'Congratulations! Daily goal completed',
    body: 'You completed 2 hours of learning today. Keep up the great work!',
    type: 'achievement',
    data: { goalDate, seconds },
  });
  req.app.get('io')?.to(`user:${req.user.id}`).emit('notification:new', item.toObject());
  return success(res, 'Daily goal completed', { notification: item, created: true }, 201);
}
export async function chatPresence(req, res) {
  const getPresence = req.app.get('getChatPresence');
  const presence = typeof getPresence === 'function'
    ? getPresence()
    : { adminOnline: false, onlineUserIds: [] };
  return success(res, 'Chat presence fetched', { adminOnline: presence.adminOnline === true });
}
export async function chatMessages(req, res) {
  const readAt = new Date();
  const result = await ChatMessage.updateMany({ user: req.user.id, sender: 'admin', readAt: null }, { readAt });
  if (result.modifiedCount) {
    req.app.get('io')?.to('admins').emit('chat:read', {
      userId: String(req.user.id),
      reader: 'user',
      readAt: readAt.toISOString(),
    });
  }
  return success(res, 'Messages fetched', await ChatMessage.find({ user: req.user.id }).sort('createdAt').limit(500).lean());
}
export async function sendChatMessage(req, res) {
  const text = req.body.text?.trim();
  if (!text) return res.status(422).json({ success: false, message: 'Message is required', data: null });
  const item = await ChatMessage.create({ user: req.user.id, sender: 'user', text });
  req.app.get('io')?.to('admins').emit('chat:message', item);
  return success(res, 'Message sent', item, 201);
}
export async function favoriteVideos(req, res) {
  const likes = await VideoLike.find({ user: req.user.id }).sort('-createdAt').lean();
  const courses = await Course.find({ _id: { $in: likes.map((item) => item.course) }, isPublished: true }).lean();
  const byId = new Map(courses.map((course) => [String(course._id), course]));
  const items = likes.flatMap((like) => {
    const course = byId.get(String(like.course));
    const video = course?.videos?.find((item) => String(item._id) === String(like.videoId));
    return course && video ? [{ _id: like._id, videoId: like.videoId, likedAt: like.createdAt, course: { ...course, isPurchased: true }, video }] : [];
  });
  return success(res, 'Favorite videos fetched', items);
}
export async function toggleVideoLike(req, res) {
  const course = await Course.findOne({ _id: req.params.courseId, isPublished: true });
  const video = course?.videos.id(req.params.videoId);
  if (!course || !video) return res.status(404).json({ success: false, message: 'Video lesson not found', data: null });
  const purchased = await Payment.exists({ user: req.user.id, course: course.id, status: 'approved', $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
  if (!purchased) return res.status(403).json({ success: false, message: 'Purchase this course before liking its videos', data: null });
  const existing = await VideoLike.findOne({ user: req.user.id, course: course.id, videoId: video._id });
  if (existing) {
    await existing.deleteOne();
    return success(res, 'Removed from favorites', { liked: false });
  }
  await VideoLike.create({ user: req.user.id, course: course.id, videoId: video._id });
  if (req.user.notificationsEnabled !== false) {
    await Notification.create({ user: req.user.id, title: 'Video added to favorites', body: `You liked “${video.title}” from ${course.title}.`, type: 'favorite', data: { courseId: course.id, videoId: video._id } });
  }
  if (req.user.notificationsEnabled !== false) {
    const item = await Notification.findOne({ user: req.user.id, type: 'favorite', 'data.videoId': video._id }).sort('-createdAt');
    if (item) req.app.get('io')?.to(`user:${req.user.id}`).emit('notification:new', item.toObject());
  }
  return success(res, 'Added to favorites', { liked: true });
}
export async function updateVideoProgress(req, res) {
  const course = await Course.findOne({ _id: req.params.courseId, isPublished: true });
  const video = course?.videos.id(req.params.videoId);
  if (!course || !video) return res.status(404).json({ success: false, message: 'Video lesson not found', data: null });
  const purchased = await Payment.exists({ user: req.user.id, course: course.id, status: 'approved', $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
  if (!purchased) return res.status(403).json({ success: false, message: 'Course subscription is required', data: null });
  const durationSeconds = Math.max(0, Number(req.body.durationSeconds) || 0);
  const lastPositionSeconds = Math.max(0, Number(req.body.positionSeconds) || 0);
  const watchedDelta = Math.min(60, Math.max(0, Number(req.body.watchedSecondsDelta) || 0));
  let item = await VideoProgress.findOneAndUpdate(
    { user: req.user.id, course: course.id, videoId: video._id },
    {
      $inc: { watchedSeconds: watchedDelta },
      $max: { durationSeconds },
      $set: { lastPositionSeconds, lastWatchedAt: new Date() },
      $setOnInsert: { user: req.user.id, course: course.id, videoId: video._id },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  if (item.durationSeconds > 0) {
    item.watchedSeconds = Math.min(item.watchedSeconds, item.durationSeconds);
    item.completed = item.watchedSeconds / item.durationSeconds >= 0.9 || item.lastPositionSeconds / item.durationSeconds >= 0.95;
    await item.save();
  }
  return success(res, 'Video progress updated', item);
}
export async function markNotificationRead(req,res) { const item=await Notification.findOneAndUpdate({_id:req.params.id,user:req.user.id},{readAt:new Date()},{new:true}); if(!item)return res.status(404).json({success:false,message:'Notification not found',data:null}); return success(res,'Notification marked as read',item); }
export async function markAllNotificationsRead(req, res) {
  const readAt = new Date();
  const result = await Notification.updateMany(
    { user: req.user.id, readAt: null },
    { readAt },
  );
  return success(res, 'All notifications marked as read', {
    updatedCount: result.modifiedCount,
    readAt,
  });
}
export async function deleteNotification(req, res) {
  const item = await Notification.findOneAndDelete({ _id: req.params.id, user: req.user.id });
  if (!item) return res.status(404).json({ success: false, message: 'Notification not found', data: null });
  return success(res, 'Notification deleted', { id: item.id });
}
export async function clearNotifications(req, res) {
  const result = await Notification.deleteMany({ user: req.user.id });
  return success(res, 'All notifications cleared', { deletedCount: result.deletedCount });
}
