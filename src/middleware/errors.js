export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const notFound = (req, res) => res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found`, data: null });
export function errorHandler(error, req, res, next) {
  const uploadTooLarge = error?.code === 'LIMIT_FILE_SIZE';
  const status = uploadTooLarge ? 413 : error.status || (error.name === 'ValidationError' ? 422 : 500);
  if (process.env.NODE_ENV !== 'test') console.error(error);
  const message = uploadTooLarge
    ? `File is too large. Maximum course upload is ${Math.max(250, Number(process.env.COURSE_UPLOAD_MAX_MB) || 2048)} MB.`
    : status === 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : error.message;
  res.status(status).json({ success: false, message, data: null });
}
