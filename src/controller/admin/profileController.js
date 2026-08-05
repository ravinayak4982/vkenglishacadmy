import AcademyUser from '../../model/academyUserModel.js';
import { success, userData } from '../../utility/academyAuth.js';

export async function profile(req, res) {
  return success(res, 'Admin profile fetched', userData(req.user));
}

export async function update(req, res) {
  const name = req.body.name?.trim();
  const email = req.body.email?.trim().toLowerCase();
  if (!name || !email) return res.status(422).json({ success: false, message: 'Name and email are required', data: null });
  const duplicate = await AcademyUser.exists({ _id: { $ne: req.user.id }, email });
  if (duplicate) return res.status(409).json({ success: false, message: 'Email is already in use', data: null });
  req.user.name = name;
  req.user.email = email;
  req.user.phone = req.body.phone?.trim() || '';
  if (req.file) req.user.avatar = `/uploads/profile/${req.file.filename}`;
  await req.user.save();
  return success(res, 'Admin profile updated', userData(req.user));
}

export async function updatePassword(req, res) {
  const currentPassword = req.body.currentPassword || '';
  const newPassword = req.body.newPassword || '';
  if (newPassword.length < 8) return res.status(422).json({ success: false, message: 'New password must contain at least 8 characters', data: null });
  if (currentPassword === newPassword) return res.status(422).json({ success: false, message: 'New password must be different from current password', data: null });
  const admin = await AcademyUser.findById(req.user.id).select('+password');
  if (!admin || !(await admin.checkPassword(currentPassword))) return res.status(422).json({ success: false, message: 'Current password is incorrect', data: null });
  admin.password = newPassword;
  await admin.save();
  return success(res, 'Password updated successfully');
}
