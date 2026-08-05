import Course from '../../model/courseModel.js';
import AcademyClass from '../../model/academyClassModel.js';
import AcademyUser from '../../model/academyUserModel.js';
import Payment from '../../model/paymentModel.js';
import { notifyUsers } from '../../services/notificationService.js';
import { success } from '../../utility/academyAuth.js';
import { listParams, listResult, safeRegex } from '../../utility/adminList.js';

const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const durationSeconds = (value) => {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return 0;
  if (/^\d+(?::\d+){1,2}$/.test(text)) {
    return text.split(':').map(Number).reduce((total, part) => total * 60 + part, 0);
  }
  const hours = Number(text.match(/([\d.]+)\s*(?:h|hr|hour)/)?.[1] || 0);
  const minutes = Number(text.match(/([\d.]+)\s*(?:m|min|minute)/)?.[1] || 0);
  const seconds = Number(text.match(/([\d.]+)\s*(?:s|sec|second)/)?.[1] || 0);
  return Math.round(hours * 3600 + minutes * 60 + seconds);
};

const totalDurationLabel = (videos = []) => {
  const total = videos.reduce((seconds, video) => seconds + durationSeconds(video.duration), 0);
  if (!total) return '';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [
    hours ? `${hours}h` : '',
    minutes ? `${minutes}m` : '',
    seconds ? `${seconds}s` : '',
  ].filter(Boolean).join(' ');
};

const syncCourseMetrics = (data, fallbackVideos = []) => {
  const videos = Array.isArray(data.videos) ? data.videos : fallbackVideos;
  data.lessons = videos.length;
  data.duration = totalDurationLabel(videos);
  return data;
};

export async function list(req, res) {
  const { page, limit, search, skip } = listParams(req);
  const pattern = search ? safeRegex(search) : null;
  const query = pattern ? { $or: [{ title: pattern }, { grade: pattern }, { slug: pattern }] } : {};
  const [items, total] = await Promise.all([
    Course.find(query).populate('classId', 'name isActive').sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(limit),
    Course.countDocuments(query),
  ]);
  return success(res, 'Courses fetched', listResult(items, total, page, limit));
}

export async function create(req, res) {
  const academyClass = await selectedClass(req, res);
  if (!academyClass) return;
  const data = syncCourseMetrics({ ...req.body, classId: academyClass._id, grade: academyClass.name, slug: req.body.slug || slugify(req.body.title || '') });
  const course = await Course.create(data);
  if (course.isPublished) {
    const users = await AcademyUser.find({ role: 'user', isActive: true, isDeleted: false }).select('_id').lean();
    await notifyUsers(req.app, users.map((user) => user._id), {
      title: 'New course available',
      body: `${course.title} for ${course.grade} is now available.`,
      type: 'course',
      data: { courseId: course.id },
    });
  }
  return success(res, 'Course created', course, 201);
}

export async function update(req, res) {
  if (!req.params.id || req.params.id === 'undefined') return res.status(400).json({ success: false, message: 'Valid course ID is required', data: null });
  const previous = await Course.findById(req.params.id).lean();
  if (!previous) return res.status(404).json({ success: false, message: 'Course not found', data: null });
  const data = { ...req.body };
  if (data.classId) {
    const academyClass = await selectedClass(req, res);
    if (!academyClass) return;
    data.classId = academyClass._id;
    data.grade = academyClass.name;
  }
  if (data.title && !data.slug) data.slug = slugify(data.title);
  syncCourseMetrics(data, previous.videos || []);
  const course = await Course.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true }).populate('classId', 'name isActive');
  const oldVideos = new Set((previous.videos || []).map((item) => item.url));
  const oldDocuments = new Set((previous.documents || []).map((item) => item.url));
  const newVideos = course.videos.filter((item) => item.url && !oldVideos.has(item.url));
  const newDocuments = course.documents.filter((item) => item.url && !oldDocuments.has(item.url));
  if (newVideos.length || newDocuments.length) {
    const buyers = await Payment.distinct('user', { course: course.id, status: 'approved' });
    if (newVideos.length) {
      await notifyUsers(req.app, buyers, {
        title: 'New video lesson',
        body: `${newVideos.length} new video${newVideos.length > 1 ? 's were' : ' was'} added to ${course.title}.`,
        type: 'video',
        data: { courseId: course.id },
      });
    }
    if (newDocuments.length) {
      await notifyUsers(req.app, buyers, {
        title: 'New PDF available',
        body: `${newDocuments.length} new PDF${newDocuments.length > 1 ? 's were' : ' was'} added to ${course.title}.`,
        type: 'pdf',
        data: { courseId: course.id },
      });
    }
  }
  return success(res, 'Course updated', course);
}

export async function remove(req, res) {
  const course = await Course.findByIdAndDelete(req.params.id);
  if (!course) return res.status(404).json({ success: false, message: 'Course not found', data: null });
  return success(res, 'Course deleted');
}

export async function uploadFile(req, res) {
  if (!req.file) return res.status(422).json({ success: false, message: 'Please select an image or video file', data: null });
  const folder = req.file.mimetype.startsWith('video/')
    ? 'videos'
    : req.file.mimetype === 'application/pdf'
      ? 'documents'
      : 'images';
  const relative = `/uploads/course/${folder}/${req.file.filename}`;
  return success(res, 'File uploaded', { url: `${req.protocol}://${req.get('host')}${relative}`, relativeUrl: relative, mimeType: req.file.mimetype, originalName: req.file.originalname, size: req.file.size }, 201);
}

async function selectedClass(req, res) {
  if (!req.body.classId) {
    res.status(422).json({ success: false, message: 'Please select a class', data: null });
    return null;
  }
  const item = await AcademyClass.findOne({ _id: req.body.classId, isActive: true });
  if (!item) {
    res.status(422).json({ success: false, message: 'Selected class is invalid or inactive', data: null });
    return null;
  }
  return item;
}
