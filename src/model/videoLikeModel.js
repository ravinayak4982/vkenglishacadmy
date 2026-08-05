import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyUser', required: true, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  videoId: { type: mongoose.Schema.Types.ObjectId, required: true },
}, { timestamps: true });

schema.index({ user: 1, course: 1, videoId: 1 }, { unique: true });
export default mongoose.models.VideoLike || mongoose.model('VideoLike', schema);
