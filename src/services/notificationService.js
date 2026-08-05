import AcademyUser from '../model/academyUserModel.js';
import Notification from '../model/academyNotificationModel.js';

export async function notifyUsers(app, userIds, payload) {
  const uniqueIds = [...new Set(userIds.map(String))];
  if (!uniqueIds.length) return [];
  const users = await AcademyUser.find({
    _id: { $in: uniqueIds },
    role: 'user',
    isActive: true,
    isDeleted: false,
    notificationsEnabled: { $ne: false },
  }).select('_id').lean();
  if (!users.length) return [];
  const items = await Notification.insertMany(users.map((user) => ({
    user: user._id,
    title: payload.title,
    body: payload.body,
    type: payload.type || 'general',
    data: payload.data || {},
  })));
  const io = app?.get('io');
  items.forEach((item) => {
    io?.to(`user:${item.user}`).emit('notification:new', item.toObject());
  });
  return items;
}

export async function notifyUser(app, userId, payload) {
  const items = await notifyUsers(app, [userId], payload);
  return items[0] || null;
}

export async function notifyAdmins(app, payload) {
  const admins = await AcademyUser.find({
    role: 'admin',
    isActive: true,
    isDeleted: false,
  }).select('_id').lean();
  if (!admins.length) return [];
  const items = await Notification.insertMany(admins.map((admin) => ({
    user: admin._id,
    title: payload.title,
    body: payload.body,
    type: payload.type || 'admin',
    data: payload.data || {},
  })));
  const io = app?.get('io');
  items.forEach((item) => {
    io?.to(`admin:${item.user}`).emit('notification:new', item.toObject());
  });
  return items;
}
