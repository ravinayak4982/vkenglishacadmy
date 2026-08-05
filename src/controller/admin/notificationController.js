import Notification from '../../model/academyNotificationModel.js';
import { success } from '../../utility/academyAuth.js';

export async function list(req, res) {
  const items = await Notification.find({ user: req.user.id })
    .sort('-createdAt')
    .limit(100)
    .lean();
  return success(res, 'Admin notifications fetched', items);
}

export async function markRead(req, res) {
  const item = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user.id },
    { readAt: new Date() },
    { new: true },
  );
  if (!item) return res.status(404).json({ success: false, message: 'Notification not found', data: null });
  return success(res, 'Notification marked as read', item);
}

export async function markAllRead(req, res) {
  const result = await Notification.updateMany(
    { user: req.user.id, readAt: null },
    { readAt: new Date() },
  );
  return success(res, 'All notifications marked as read', { updatedCount: result.modifiedCount });
}

export async function clear(req, res) {
  const result = await Notification.deleteMany({ user: req.user.id });
  return success(res, 'Admin notifications cleared', { deletedCount: result.deletedCount });
}
