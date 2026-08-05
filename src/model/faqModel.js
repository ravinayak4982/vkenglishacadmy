import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  question: { type: String, required: true, trim: true, maxlength: 300 },
  answer: { type: String, required: true, trim: true, maxlength: 3000 },
  sortOrder: { type: Number, min: 0, default: 0, index: true },
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true });

export default mongoose.models.Faq || mongoose.model('Faq', schema);
