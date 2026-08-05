import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  sortOrder: { type: Number, min: 0, default: 0, index: true },
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true });

schema.index({ sortOrder: 1, name: 1 });

export default mongoose.models.AcademyClass || mongoose.model('AcademyClass', schema);
