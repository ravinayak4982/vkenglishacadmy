import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export const success = (res, message, data = null, status = 200) =>
  res.status(status).json({ success: true, message, data });

export const createToken = (user, type = 'access', expiresIn) => jwt.sign(
  { sub: user.id, role: user.role, type },
  process.env.JWT_SECRET,
  { expiresIn: expiresIn || (type === 'access' ? '15m' : '30d') },
);

export const hashOtp = (value) =>
  crypto.createHash('sha256').update(String(value)).digest('hex');

export const userData = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  avatar: user.avatar,
  studentClass: user.studentClass,
  notificationsEnabled: user.notificationsEnabled !== false,
  role: user.role,
  emailVerified: user.emailVerified,
  isActive: user.isActive,
  accountStatus: user.accountStatus || (user.isActive ? 'active' : 'blocked'),
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt,
});
