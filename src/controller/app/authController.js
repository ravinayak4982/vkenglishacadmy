import jwt from 'jsonwebtoken';
import AcademyUser from '../../model/academyUserModel.js';
import { sendMail } from '../../services/mailService.js';
import { createToken, success, userData } from '../../utility/academyAuth.js';
import Notification from '../../model/academyNotificationModel.js';
import { notifyAdmins } from '../../services/notificationService.js';

export async function register(req, res) {
  const { name, email, password, phone = '', studentClass = '' } = req.body;
  if (!name || !email || !password || password.length < 8) {
    return res.status(422).json({ success: false, message: 'Name, valid email and 8+ character password are required', data: null });
  }
  if (await AcademyUser.exists({ email: email.toLowerCase() })) {
    return res.status(409).json({ success: false, message: 'Email already registered', data: null });
  }
  const user = await AcademyUser.create({ name, email, password, phone, studentClass, role: 'user' });
  await Notification.create({ user: user.id, title: 'Welcome to VK English Academy', body: `Hi ${user.name}, your student account is ready. Explore your class courses and begin learning.`, type: 'welcome' });
  await notifyAdmins(req.app, {
    title: 'New student registered',
    body: `${user.name} (${user.studentClass || 'Class not selected'}) has joined the academy.`,
    type: 'registration',
    data: { userId: user.id },
  });
  await sendMail({ to: user.email, subject: 'Welcome to VK English Academy', text: `Welcome ${user.name}! Your account is ready.` }).catch(() => null);
  return success(res, 'Registration successful', userData(user), 201);
}

export async function login(req, res) {
  const user = await AcademyUser.findOne({ email: req.body.email?.toLowerCase(), role: 'user', isDeleted: false }).select('+password');
  if (!user || !user.isActive || !(await user.checkPassword(req.body.password || ''))) {
    return res.status(401).json({ success: false, message: 'Invalid email or password', data: null });
  }
  user.otp = undefined;
  user.emailVerified = true;
  user.lastLoginAt = new Date();
  await user.save();
  return success(res, 'Login successful', {
    user: userData(user),
    accessToken: createToken(user),
    refreshToken: createToken(user, 'refresh'),
  });
}

export async function refreshToken(req, res) {
  try {
    const payload = jwt.verify(req.body.refreshToken, process.env.JWT_SECRET);
    if (payload.type !== 'refresh') throw new Error();
    const user = await AcademyUser.findOne({ _id: payload.sub, role: 'user', isActive: true, isDeleted: false });
    if (!user) throw new Error();
    return success(res, 'Token refreshed', {
      accessToken: createToken(user),
      refreshToken: createToken(user, 'refresh'),
    });
  } catch (_) {
    return res.status(401).json({ success: false, message: 'Invalid refresh token', data: null });
  }
}
