import AcademyClass from '../../model/academyClassModel.js';
import Course from '../../model/courseModel.js';
import { success } from '../../utility/academyAuth.js';
import { listParams, listResult, safeRegex } from '../../utility/adminList.js';

export async function list(req, res) {
  const { page, limit, search, skip } = listParams(req);
  const query = search ? { name: safeRegex(search) } : {};
  const [items, total] = await Promise.all([
    AcademyClass.find(query).sort({ sortOrder: 1, name: 1 }).skip(skip).limit(limit),
    AcademyClass.countDocuments(query),
  ]);
  const usage = await Course.aggregate([
    { $match: { classId: { $ne: null } } },
    { $group: { _id: '$classId', courseCount: { $sum: 1 } } },
  ]);
  const counts = new Map(usage.map((item) => [String(item._id), item.courseCount]));
  const values = items.map((item) => ({
    ...item.toObject(),
    courseCount: counts.get(String(item._id)) || 0,
  }));
  return success(res, 'Classes fetched', listResult(values, total, page, limit));
}

export async function details(req, res) {
  const item = await AcademyClass.findById(req.params.id).lean();
  if (!item) return res.status(404).json({ success: false, message: 'Class not found', data: null });
  const courses = await Course.find({ classId: item._id }).select('title grade price isPublished videos').sort('-createdAt').lean();
  return success(res, 'Class fetched', { ...item, courses });
}

export async function create(req, res) {
  const name = req.body.name?.trim();
  if (!name) return res.status(422).json({ success: false, message: 'Class name is required', data: null });
  if (await AcademyClass.exists({ name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } })) {
    return res.status(409).json({ success: false, message: 'This class already exists', data: null });
  }
  const item = await AcademyClass.create({
    name,
    sortOrder: Number(req.body.sortOrder || 0),
    isActive: req.body.isActive !== false,
  });
  return success(res, 'Class created', item, 201);
}

export async function update(req, res) {
  const item = await AcademyClass.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Class not found', data: null });
  const name = req.body.name?.trim();
  if (!name) return res.status(422).json({ success: false, message: 'Class name is required', data: null });
  const duplicate = await AcademyClass.exists({ _id: { $ne: item._id }, name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } });
  if (duplicate) return res.status(409).json({ success: false, message: 'This class already exists', data: null });

  item.name = name;
  item.sortOrder = Number(req.body.sortOrder || 0);
  item.isActive = req.body.isActive !== false;
  await item.save();
  await Course.updateMany({ classId: item._id }, { grade: item.name });
  return success(res, 'Class updated', item);
}

export async function remove(req, res) {
  const item = await AcademyClass.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Class not found', data: null });
  const courseCount = await Course.countDocuments({ classId: item._id });
  if (courseCount) {
    return res.status(409).json({ success: false, message: `This class is used by ${courseCount} course(s). Move or delete those courses first.`, data: null });
  }
  await item.deleteOne();
  return success(res, 'Class deleted');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
