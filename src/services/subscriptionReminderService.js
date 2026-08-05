import Payment from '../model/paymentModel.js';
import { notifyUser } from './notificationService.js';

const reminderDays = [7, 3, 1];

export async function runSubscriptionExpiryReminders(app, userId = null) {
  const now = new Date();
  const until = new Date(now.getTime() + 8 * 86400000);
  const query = { status: 'approved', expiresAt: { $gt: now, $lte: until } };
  if (userId) query.user = userId;
  const payments = await Payment.find(query).populate('course', 'title').lean();
  let sent = 0;
  for (const payment of payments) {
    const remaining = Math.max(1, Math.ceil((new Date(payment.expiresAt) - now) / 86400000));
    const day = reminderDays.find((value) => remaining <= value && !(payment.expiryReminderDays || []).includes(value));
    if (!day) continue;
    const claimed = await Payment.updateOne({ _id: payment._id, expiryReminderDays: { $ne: day } }, { $addToSet: { expiryReminderDays: day } });
    if (!claimed.modifiedCount) continue;
    await notifyUser(app, payment.user, {
      title: 'Course subscription expiring soon',
      body: `${payment.course?.title || 'Your course'} access expires in ${remaining} day${remaining === 1 ? '' : 's'}. Renew to continue learning.`,
      type: 'subscription_expiry',
      data: { paymentId: payment._id, courseId: payment.course?._id, expiresAt: payment.expiresAt, daysRemaining: remaining },
    });
    sent += 1;
  }
  return sent;
}
