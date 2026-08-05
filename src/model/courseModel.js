import mongoose from 'mongoose';

const resourceSchema = new mongoose.Schema({ title: { type: String, required: true }, url: { type: String, default: '' }, duration: { type: String, default: '' }, topic: { type: String, default: '' }, captionsUrl: { type: String, default: '' }, type: { type: String, default: 'PDF' }, pages: { type: Number, default: 0 } }, { _id: true });
const faqSchema = new mongoose.Schema({ question: { type: String, required: true }, answer: { type: String, required: true } }, { _id: true });
const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true }, slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyClass', default: null, index: true },
  grade: { type: String, required: true, trim: true, index: true }, description: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 }, oldPrice: { type: Number, min: 0, default: 0 }, duration: { type: String, default: '' }, lessons: { type: Number, min: 0, default: 0 },
  image: { type: String, default: '' }, color: { type: String, default: '#059669' }, videos: [resourceSchema], documents: [resourceSchema], faqs: [faqSchema],
  isPublished: { type: Boolean, default: true, index: true }, sortOrder: { type: Number, default: 0, index: true },
}, { timestamps: true });
schema.index({ isPublished: 1, sortOrder: 1, createdAt: -1 });
export default mongoose.models.Course || mongoose.model('Course', schema);
