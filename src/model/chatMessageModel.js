import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyUser', required: true, index: true },
  sender: { type: String, enum: ['user', 'admin'], required: true },
  text: { type: String, required: true, trim: true, maxlength: 3000 },
  readAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ user: 1, createdAt: 1 });
export default mongoose.models.ChatMessage || mongoose.model('ChatMessage', schema);
