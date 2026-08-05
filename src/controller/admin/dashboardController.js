import AcademyUser from '../../model/academyUserModel.js';
import AcademyClass from '../../model/academyClassModel.js';
import Course from '../../model/courseModel.js';
import Payment from '../../model/paymentModel.js';
import VideoProgress from '../../model/videoProgressModel.js';
import { success } from '../../utility/academyAuth.js';

export async function dashboard(req, res) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const month = new Date(today.getFullYear(), today.getMonth(), 1);
  const trendStart = new Date(today);
  trendStart.setDate(trendStart.getDate() - 6);
  const analyticsStart = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  const activeSince = new Date(Date.now() - 7 * 86400000);
  const [
    users, activeUsers, blockedUsers, todayUsers, classes, courseStats,
    pending, approved, rejected, revenue, monthRevenue, watchTime,
    recentPayments, recentStudents, registrationTrend, topLearners,
    activeStudents, monthlyRevenueTrend, courseWatchStats, videoDropOff,
  ] = await Promise.all([
    AcademyUser.countDocuments({ role: 'user', isDeleted: false }),
    AcademyUser.countDocuments({ role: 'user', isDeleted: false, isActive: true }),
    AcademyUser.countDocuments({ role: 'user', isDeleted: false, isActive: false }),
    AcademyUser.countDocuments({ role: 'user', isDeleted: false, createdAt: { $gte: today } }),
    AcademyClass.countDocuments({ isActive: true }),
    Course.aggregate([{ $group: { _id: null, courses: { $sum: 1 }, published: { $sum: { $cond: ['$isPublished', 1, 0] } }, videos: { $sum: { $size: { $ifNull: ['$videos', []] } } }, pdfs: { $sum: { $size: { $ifNull: ['$documents', []] } } } } }]),
    Payment.countDocuments({ status: 'pending' }),
    Payment.countDocuments({ status: 'approved' }),
    Payment.countDocuments({ status: 'rejected' }),
    Payment.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Payment.aggregate([{ $match: { status: 'approved', reviewedAt: { $gte: month } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    VideoProgress.aggregate([{ $group: { _id: null, seconds: { $sum: '$watchedSeconds' }, completed: { $sum: { $cond: ['$completed', 1, 0] } } } }]),
    Payment.find().populate('user', 'name email').populate('course', 'title grade').sort('-createdAt').limit(6).lean(),
    AcademyUser.find({ role: 'user', isDeleted: false }).select('name email avatar studentClass accountStatus isActive createdAt').sort('-createdAt').limit(5).lean(),
    AcademyUser.aggregate([
      { $match: { role: 'user', isDeleted: false, createdAt: { $gte: trendStart } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    VideoProgress.aggregate([
      { $group: {
        _id: '$user',
        watchedSeconds: { $sum: '$watchedSeconds' },
        durationSeconds: { $sum: '$durationSeconds' },
        completedVideos: { $sum: { $cond: ['$completed', 1, 0] } },
        trackedVideos: { $sum: 1 },
        lastWatchedAt: { $max: '$lastWatchedAt' },
      } },
      { $sort: { watchedSeconds: -1 } },
      { $limit: 6 },
      { $lookup: { from: 'academyusers', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $match: { 'user.isDeleted': false } },
      { $project: {
        _id: 0,
        user: { _id: '$user._id', name: '$user.name', avatar: '$user.avatar', studentClass: '$user.studentClass' },
        watchedSeconds: 1,
        durationSeconds: 1,
        completedVideos: 1,
        trackedVideos: 1,
        lastWatchedAt: 1,
      } },
    ]),
    VideoProgress.distinct('user', { lastWatchedAt: { $gte: activeSince } }),
    Payment.aggregate([
      { $match: { status: 'approved', reviewedAt: { $gte: analyticsStart } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$reviewedAt' } }, revenue: { $sum: '$amount' }, payments: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    VideoProgress.aggregate([
      { $group: { _id: '$course', watchedSeconds: { $sum: '$watchedSeconds' }, viewers: { $addToSet: '$user' }, completions: { $sum: { $cond: ['$completed', 1, 0] } } } },
      { $sort: { watchedSeconds: -1 } }, { $limit: 6 },
      { $lookup: { from: 'courses', localField: '_id', foreignField: '_id', as: 'course' } },
      { $unwind: '$course' },
      { $project: { _id: 0, courseId: '$_id', title: '$course.title', grade: '$course.grade', watchedSeconds: 1, viewers: { $size: '$viewers' }, completions: 1 } },
    ]),
    VideoProgress.aggregate([
      { $match: { durationSeconds: { $gt: 0 }, completed: false } },
      { $project: { course: 1, videoId: 1, user: 1, percentage: { $multiply: [{ $divide: ['$lastPositionSeconds', '$durationSeconds'] }, 100] } } },
      { $match: { percentage: { $gte: 5, $lt: 90 } } },
      { $group: { _id: { course: '$course', videoId: '$videoId' }, averageDropOff: { $avg: '$percentage' }, students: { $addToSet: '$user' } } },
      { $sort: { students: -1 } }, { $limit: 8 },
      { $lookup: { from: 'courses', localField: '_id.course', foreignField: '_id', as: 'course' } },
      { $unwind: '$course' },
      { $project: { _id: 0, courseId: '$_id.course', videoId: '$_id.videoId', courseTitle: '$course.title', video: { $arrayElemAt: [{ $filter: { input: '$course.videos', as: 'video', cond: { $eq: ['$$video._id', '$_id.videoId'] } } }, 0] }, averageDropOff: { $round: ['$averageDropOff', 0] }, students: { $size: '$students' } } },
      { $project: { courseId: 1, videoId: 1, courseTitle: 1, videoTitle: '$video.title', averageDropOff: 1, students: 1 } },
    ]),
  ]);
  const content = courseStats[0] || { courses: 0, published: 0, videos: 0, pdfs: 0 };
  const learning = watchTime[0] || { seconds: 0, completed: 0 };
  const trendByDate = new Map(registrationTrend.map((item) => [item._id, item.count]));
  const studentTrend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(trendStart);
    date.setDate(date.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    return {
      date: key,
      label: date.toLocaleDateString('en-IN', { weekday: 'short' }),
      count: trendByDate.get(key) || 0,
    };
  });
  const learnerProgress = topLearners.map((item) => ({
    ...item,
    percentage: item.durationSeconds > 0
      ? Math.min(100, Math.round((item.watchedSeconds / item.durationSeconds) * 100))
      : item.trackedVideos
        ? Math.round((item.completedVideos / item.trackedVideos) * 100)
        : 0,
    watchHours: Number((item.watchedSeconds / 3600).toFixed(1)),
  }));
  const revenueByMonth = new Map(monthlyRevenueTrend.map((item) => [item._id, item]));
  const revenueTrend = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - 5 + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { month: key, label: date.toLocaleDateString('en-IN', { month: 'short' }), revenue: revenueByMonth.get(key)?.revenue || 0, payments: revenueByMonth.get(key)?.payments || 0 };
  });
  return success(res, 'Dashboard fetched', {
    users, activeUsers, blockedUsers, todayUsers, classes,
    ...content,
    pendingPayments: pending,
    approvedPayments: approved,
    rejectedPayments: rejected,
    totalPayments: pending + approved + rejected,
    totalRevenue: revenue[0]?.total || 0,
    monthRevenue: monthRevenue[0]?.total || 0,
    watchHours: Number((learning.seconds / 3600).toFixed(1)),
    completedVideos: learning.completed,
    recentPayments, recentStudents, studentTrend, learnerProgress,
    activeStudents7d: activeStudents.length,
    revenueTrend,
    topCourses: courseWatchStats.map((item) => ({ ...item, watchHours: Number((item.watchedSeconds / 3600).toFixed(1)) })),
    videoDropOff,
  });
}
