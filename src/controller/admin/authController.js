import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import AcademyUser from '../../model/academyUserModel.js';
import { createToken, JWT_SECRET, success, userData } from '../../utility/academyAuth.js';

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export async function login(req, res) {
  const admin = await AcademyUser.findOne({ email: req.body.email?.toLowerCase(), role: 'admin', isDeleted: false }).select('+password');
  if (!admin || !admin.isActive || !(await admin.checkPassword(req.body.password || ''))) {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials', data: null });
  }
  const rememberMe = req.body.rememberMe === true;
  const sessionDays = rememberMe ? 30 : 1;
  const refreshToken = createToken(admin, 'refresh', `${sessionDays}d`);
  const now = new Date();
  admin.lastLoginAt = now;
  admin.refreshTokens = (admin.refreshTokens || [])
    .filter((item) => item.expiresAt > now)
    .slice(-4);
  admin.refreshTokens.push({
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(now.getTime() + sessionDays * 24 * 60 * 60 * 1000),
  });
  await admin.save();
  return success(res, 'Admin login successful', {
    user: userData(admin),
    accessToken: createToken(admin),
    refreshToken,
    expiresInDays: sessionDays,
  });
}

export async function refresh(req, res) {
  try {
    const token = req.body.refreshToken;
    if (!token) throw new Error();
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== 'refresh' || payload.role !== 'admin') throw new Error();
    const admin = await AcademyUser.findOne({
      _id: payload.sub,
      role: 'admin',
      isActive: true,
      isDeleted: false,
      refreshTokens: {
        $elemMatch: { tokenHash: hashToken(token), expiresAt: { $gt: new Date() } },
      },
    });
    if (!admin) throw new Error();
    return success(res, 'Admin session refreshed', {
      user: userData(admin),
      accessToken: createToken(admin),
    });
  } catch (_) {
    return res.status(401).json({ success: false, message: 'Admin session has expired', data: null });
  }
}

export async function logout(req, res) {
  const token = req.body.refreshToken;
  if (token) {
    await AcademyUser.updateOne(
      { refreshTokens: { $elemMatch: { tokenHash: hashToken(token) } } },
      { $pull: { refreshTokens: { tokenHash: hashToken(token) } } },
    );
  }
  return success(res, 'Admin signed out');
}
