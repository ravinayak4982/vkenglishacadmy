import jwt from 'jsonwebtoken';
import AcademyUser from '../model/academyUserModel.js';
import { JWT_SECRET } from '../utility/academyAuth.js';

export async function authenticate(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new Error();
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== 'access') throw new Error();
    const user = await AcademyUser.findById(payload.sub).select('-password -otp -refreshTokens');
    if (!user || user.isDeleted || !user.isActive) throw new Error();
    req.user = user;
    return next();
  } catch (_) {
    return res.status(401).json({ success: false, message: 'Invalid or expired authentication', data: null });
  }
}

export const allowRoles = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role)
    ? next()
    : res.status(403).json({ success: false, message: 'You do not have permission', data: null });

export async function optionalAuthenticate(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = await AcademyUser.findById(payload.sub).select('-password -otp -refreshTokens');
  } catch (_) { req.user = null; }
  return next();
}
