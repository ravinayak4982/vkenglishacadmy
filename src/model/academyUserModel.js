import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 }, email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  password: { type: String, required: true, select: false }, phone: { type: String, trim: true, default: '' }, avatar: { type: String, default: '' },
  studentClass: { type: String, trim: true, default: '' },
  role: { type: String, enum: ['user', 'admin'], default: 'user', index: true }, emailVerified: { type: Boolean, default: false },
  accountStatus: { type: String, enum: ['active', 'inactive', 'blocked'], default: 'active', index: true },
  isActive: { type: Boolean, default: true, index: true }, isDeleted: { type: Boolean, default: false, index: true },
  notificationsEnabled: { type: Boolean, default: true },
  otp: { hash: String, purpose: String, expiresAt: Date, attempts: { type: Number, default: 0 } }, refreshTokens: [{ tokenHash: String, expiresAt: Date }], lastLoginAt: Date, lastSeenAt: Date,
}, { timestamps: true });
schema.pre('save', async function(next) { if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 12); next(); });
schema.methods.checkPassword = function(value) { return bcrypt.compare(value, this.password); };
export default mongoose.models.AcademyUser || mongoose.model('AcademyUser', schema);
