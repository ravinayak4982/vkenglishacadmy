import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyUser', required: true, index: true }, screenshot: { type: String, required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  amount: { type: Number, required: true, min: 1 }, transactionId: { type: String, required: true, trim: true, unique: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true }, remark: { type: String, trim: true, maxlength: 500, default: '' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyUser' }, reviewedAt: Date,
  subscriptionStartedAt: Date,
  expiresAt: { type: Date, default: null, index: true },
  expiryReminderDays: { type: [Number], default: [] },
}, { timestamps: true });
schema.index({ status: 1, createdAt: -1 });
schema.index({ status: 1, expiresAt: 1 });
export default mongoose.models.Payment || mongoose.model('Payment', schema);
