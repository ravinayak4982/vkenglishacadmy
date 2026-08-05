import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyUser', required: true, index: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true, maxlength: 600, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'hidden'], default: 'pending', index: true },
  moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyUser', default: null },
  moderatedAt: Date,
}, { timestamps: true });

schema.index({ course: 1, user: 1 }, { unique: true });
schema.index({ course: 1, status: 1, createdAt: -1 });
export default mongoose.models.CourseReview || mongoose.model('CourseReview', schema);
