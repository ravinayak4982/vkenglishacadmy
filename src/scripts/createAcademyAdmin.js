import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(scriptDirectory, '../../.env') });
import connectDatabase from '../config/database.js';
import AcademyUser from '../model/academyUserModel.js';
import mongoose from 'mongoose';

const email = process.env.ADMIN_EMAIL?.toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!email || !password || password.length < 8) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (minimum 8 characters) in backend/.env');
  process.exit(1);
}

await connectDatabase();
let admin = await AcademyUser.findOne({ email }).select('+password');
if (admin) {
  admin.role = 'admin'; admin.isActive = true; admin.isDeleted = false;
  admin.password = password; await admin.save();
  console.log(`Academy admin updated: ${email}`);
} else {
  await AcademyUser.create({ name: process.env.ADMIN_NAME || 'VK Academy Admin', email, password, role: 'admin', emailVerified: true });
  console.log(`Academy admin created: ${email}`);
}
await mongoose.disconnect();
