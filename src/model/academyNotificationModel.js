import mongoose from 'mongoose';
const schema = new mongoose.Schema({ user: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyUser', required: true, index: true }, title: { type: String, required: true }, body: { type: String, required: true }, type: { type: String, default: 'general' }, data: { type: mongoose.Schema.Types.Mixed, default: {} }, readAt: Date }, { timestamps: true });
schema.index({ user: 1, createdAt: -1 });
export default mongoose.models.AcademyNotification || mongoose.model('AcademyNotification', schema);
