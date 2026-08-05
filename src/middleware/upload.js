import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadsRoot = path.resolve('uploads');
const courseUploadMaxMb = Math.max(250, Number(process.env.COURSE_UPLOAD_MAX_MB) || 2048);
const storage = multer.diskStorage({
  destination(req, file, callback) {
    const folder = file.fieldname === 'screenshot'
      ? 'payment'
      : file.fieldname === 'avatar'
        ? 'profile'
        : 'settings';
    const directory = path.join(uploadsRoot, folder);
    fs.mkdirSync(directory, { recursive: true });
    callback(null, directory);
  },
  filename(req, file, callback) {
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase()}`);
  },
});
export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      const fileLabel = file.fieldname === 'avatar'
        ? 'Profile photo'
        : file.fieldname === 'screenshot'
          ? 'Payment screenshot'
          : 'QR image';
      const error = new Error(`${fileLabel} must be a JPG, PNG or WebP image`);
      error.status = 422;
      return callback(error);
    }
    return callback(null, true);
  },
});

const courseStorage = multer.diskStorage({
  destination(req, file, callback) {
    const folder = file.mimetype.startsWith('video/')
      ? 'course/videos'
      : file.mimetype === 'application/pdf'
        ? 'course/documents'
        : 'course/images';
    const directory = path.join(uploadsRoot, folder);
    fs.mkdirSync(directory, { recursive: true });
    callback(null, directory);
  },
  filename(req, file, callback) {
    const safeName = path.basename(file.originalname, path.extname(file.originalname)).replace(/[^a-z0-9-]+/gi, '-').slice(0, 60);
    callback(null, `${Date.now()}-${safeName}${path.extname(file.originalname).toLowerCase()}`);
  },
});

export const courseUpload = multer({
  storage: courseStorage,
  limits: { fileSize: courseUploadMaxMb * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) {
      const error = new Error('Only JPG, PNG, WebP, MP4, WebM, MOV or PDF files are allowed');
      error.status = 422;
      return callback(error);
    }
    return callback(null, true);
  },
});
