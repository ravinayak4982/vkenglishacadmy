import AcademyUser from '../../model/academyUserModel.js';
import Notification from '../../model/academyNotificationModel.js';
import Payment from '../../model/paymentModel.js';
import Course from '../../model/courseModel.js';
import VideoLike from '../../model/videoLikeModel.js';
import VideoProgress from '../../model/videoProgressModel.js';
import { success, userData } from '../../utility/academyAuth.js';
import { listParams, listResult, safeRegex } from '../../utility/adminList.js';

const resolvedStatus = (user) => user.accountStatus && !(user.accountStatus === 'active' && user.isActive === false)
  ? user.accountStatus
  : (user.isActive ? 'active' : 'blocked');

export async function list(req, res) {
  const { page, limit, search, skip } = listParams(req);
  const pattern = search ? safeRegex(search) : null;
  const query = { role: 'user', isDeleted: false, ...(pattern ? { $or: [{ name: pattern }, { email: pattern }, { phone: pattern }, { studentClass: pattern }] } : {}) };
  const [items, total] = await Promise.all([
    AcademyUser.find(query).select('-otp -refreshTokens').sort('-createdAt').skip(skip).limit(limit).lean(),
    AcademyUser.countDocuments(query),
  ]);
  return success(res, 'Users fetched', listResult(items.map((item) => ({ ...item, accountStatus: resolvedStatus(item) })), total, page, limit));
}

export async function updateStatus(req, res) {
  const status = req.body.status || (req.body.isActive === true ? 'active' : 'blocked');
  if (!['active', 'inactive', 'blocked'].includes(status)) return res.status(422).json({ success: false, message: 'Status must be active, inactive or blocked', data: null });
  const user = await AcademyUser.findOneAndUpdate({ _id: req.params.id, role: 'user', isDeleted: false }, { accountStatus: status, isActive: status === 'active' }, { new: true });
  if (!user) return res.status(404).json({ success: false, message: 'User not found', data: null });
  return success(res, `Student marked ${status}`, userData(user));
}

export async function update(req, res) {
  const data = {
    name: req.body.name?.trim(),
    email: req.body.email?.trim().toLowerCase(),
    phone: req.body.phone?.trim() || '',
    studentClass: req.body.studentClass?.trim() || '',
  };
  if (!data.name || !data.email) return res.status(422).json({ success: false, message: 'Name and email are required', data: null });
  const duplicate = await AcademyUser.exists({ _id: { $ne: req.params.id }, email: data.email });
  if (duplicate) return res.status(409).json({ success: false, message: 'Email is already in use', data: null });
  const user = await AcademyUser.findOneAndUpdate({ _id: req.params.id, role: 'user', isDeleted: false }, data, { new: true, runValidators: true });
  if (!user) return res.status(404).json({ success: false, message: 'User not found', data: null });
  return success(res, 'Student updated', userData(user));
}

export async function remove(req, res) {
  const user = await AcademyUser.findOneAndUpdate({ _id: req.params.id, role: 'user', isDeleted: false }, { isDeleted: true, isActive: false, accountStatus: 'blocked' }, { new: true });
  if (!user) return res.status(404).json({ success: false, message: 'User not found', data: null });
  return success(res, 'Student deleted');
}

export async function details(req, res) {
  const user = await AcademyUser.findOne({ _id: req.params.id, role: 'user', isDeleted: false }).select('-password -otp -refreshTokens').lean();
  if (!user) return res.status(404).json({ success: false, message: 'User not found', data: null });
  const [payments, likes, progressItems, notifications] = await Promise.all([
    Payment.find({ user: user._id }).populate('course').sort('-createdAt').lean(),
    VideoLike.find({ user: user._id }).sort('-createdAt').lean(),
    VideoProgress.find({ user: user._id }).sort('-lastWatchedAt').lean(),
    Notification.find({ user: user._id }).sort('-createdAt').limit(20).lean(),
  ]);
  const subscriptions = payments.filter((item) => item.status === 'approved' && item.course);
  const courseIds = [...new Set([...subscriptions.map((item) => String(item.course._id)), ...likes.map((item) => String(item.course)), ...progressItems.map((item) => String(item.course))])];
  const extraCourses = await Course.find({ _id: { $in: courseIds } }).lean();
  const courses = new Map(extraCourses.map((course) => [String(course._id), course]));
  subscriptions.forEach((item) => courses.set(String(item.course._id), item.course));
  const likedVideos = likes.flatMap((like) => {
    const course = courses.get(String(like.course));
    const video = course?.videos?.find((item) => String(item._id) === String(like.videoId));
    return video ? [{ ...like, course: { _id: course._id, title: course.title, grade: course.grade }, video }] : [];
  });
  const progressByVideo = new Map(progressItems.map((item) => [`${item.course}:${item.videoId}`, item]));
  const courseProgress = subscriptions.map((subscription) => {
    const course = subscription.course;
    const videos = (course.videos || []).map((video) => {
      const progress = progressByVideo.get(`${course._id}:${video._id}`);
      const duration = progress?.durationSeconds || 0;
      const percentage = duration > 0 ? Math.min(100, Math.round((progress.watchedSeconds / duration) * 100)) : 0;
      return { ...video, watchedSeconds: progress?.watchedSeconds || 0, durationSeconds: duration, lastPositionSeconds: progress?.lastPositionSeconds || 0, completed: progress?.completed || false, percentage, lastWatchedAt: progress?.lastWatchedAt || null };
    });
    const percentage = videos.length ? Math.round(videos.reduce((total, video) => total + video.percentage, 0) / videos.length) : 0;
    return { course: { _id: course._id, title: course.title, grade: course.grade, image: course.image }, purchasedAt: subscription.reviewedAt || subscription.createdAt, paymentAmount: subscription.amount, percentage, watchedSeconds: videos.reduce((total, video) => total + video.watchedSeconds, 0), completedVideos: videos.filter((video) => video.completed).length, totalVideos: videos.length, videos };
  });
  const totalWatchedSeconds = progressItems.reduce((total, item) => total + item.watchedSeconds, 0);
  const totalVideos = courseProgress.reduce((total, item) => total + item.totalVideos, 0);
  const completedVideos = progressItems.filter((item) => item.completed).length;
  const overallPercentage = totalVideos ? Math.round(courseProgress.reduce((total, item) => total + item.percentage * item.totalVideos, 0) / totalVideos) : 0;
  return success(res, 'User details fetched', {
    user: { ...user, accountStatus: resolvedStatus(user) },
    payments,
    subscriptions,
    likedVideos,
    notifications,
    progress: { summary: { totalWatchedSeconds, watchHours: Number((totalWatchedSeconds / 3600).toFixed(1)), totalVideos, completedVideos, overallPercentage }, courses: courseProgress, recent: progressItems.slice(0, 15) },
  });
}
