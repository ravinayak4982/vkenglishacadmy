import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyUser', required: true, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  videoId: { type: mongoose.Schema.Types.ObjectId, required: true },
  watchedSeconds: { type: Number, default: 0, min: 0 },
  durationSeconds: { type: Number, default: 0, min: 0 },
  lastPositionSeconds: { type: Number, default: 0, min: 0 },
  completed: { type: Boolean, default: false, index: true },
  lastWatchedAt: { type: Date, default: Date.now },
}, { timestamps: true });

schema.index({ user: 1, course: 1, videoId: 1 }, { unique: true });
schema.index({ user: 1, lastWatchedAt: -1 });
export default mongoose.models.VideoProgress || mongoose.model('VideoProgress', schema);
