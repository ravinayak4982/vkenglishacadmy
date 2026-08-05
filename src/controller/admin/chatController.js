import AcademyUser from '../../model/academyUserModel.js';
import ChatMessage from '../../model/chatMessageModel.js';
import { notifyUser } from '../../services/notificationService.js';
import { success } from '../../utility/academyAuth.js';
import { safeRegex } from '../../utility/adminList.js';

export async function conversations(req, res) {
  const search = req.query.search?.trim() || '';
  const pattern = search ? safeRegex(search) : null;
  const query = { role: 'user', isDeleted: false, ...(pattern ? { $or: [{ name: pattern }, { email: pattern }, { studentClass: pattern }] } : {}) };
  const users = await AcademyUser.find(query)
    .select('name email avatar studentClass isActive accountStatus lastSeenAt')
    .sort('name')
    .lean();
  const lastMessages = await ChatMessage.aggregate([
    { $match: { user: { $in: users.map((user) => user._id) } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$user', lastMessage: { $first: '$$ROOT' }, unread: { $sum: { $cond: [{ $and: [{ $eq: ['$sender', 'user'] }, { $eq: ['$readAt', null] }] }, 1, 0] } } } },
  ]);
  const byUser = new Map(lastMessages.map((item) => [String(item._id), item]));
  const items = users
    .map((user) => ({ ...user, ...(byUser.get(String(user._id)) || { unread: 0, lastMessage: null }) }))
    .sort((first, second) => {
      const firstTime = first.lastMessage?.createdAt ? new Date(first.lastMessage.createdAt).getTime() : 0;
      const secondTime = second.lastMessage?.createdAt ? new Date(second.lastMessage.createdAt).getTime() : 0;
      return secondTime - firstTime || first.name.localeCompare(second.name);
    });
  return success(res, 'Conversations fetched', {
    items,
    total: items.length,
  });
}

export async function messages(req, res) {
  const user = await AcademyUser.findOne({ _id: req.params.userId, role: 'user', isDeleted: false }).select('name email avatar studentClass').lean();
  if (!user) return res.status(404).json({ success: false, message: 'Student not found', data: null });
  const readAt = new Date();
  const result = await ChatMessage.updateMany({ user: user._id, sender: 'user', readAt: null }, { readAt });
  if (result.modifiedCount) {
    req.app.get('io')?.to(`user:${user._id}`).emit('chat:read', {
      userId: String(user._id),
      reader: 'admin',
      readAt: readAt.toISOString(),
    });
  }
  return success(res, 'Messages fetched', { user, messages: await ChatMessage.find({ user: user._id }).sort('createdAt').limit(500).lean() });
}

export async function send(req, res) {
  const text = req.body.text?.trim();
  if (!text) return res.status(422).json({ success: false, message: 'Message is required', data: null });
  const item = await ChatMessage.create({ user: req.params.userId, sender: 'admin', text });
  req.app.get('io')?.to(`user:${req.params.userId}`).emit('chat:message', item);
  await notifyUser(req.app, req.params.userId, {
    title: 'New message from academy',
    body: text,
    type: 'chat',
    data: { messageId: item.id },
  });
  return success(res, 'Message sent', item, 201);
}
