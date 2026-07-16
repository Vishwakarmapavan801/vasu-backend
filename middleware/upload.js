const multer = require('multer');
const path = require('path');
const config = require('../config/config');
const AppError = require('../utils/AppError');

/**
 * File Upload Configuration
 *
 * Handles property image uploads with file type validation,
 * size limits, and organized storage.
 */

// Allowed file types for property images
const ALLOWED_FILE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.fileUploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `property-${uniqueSuffix}${ext}`);
  },
});

// File filter to validate types
const fileFilter = (req, file, cb) => {
  if (ALLOWED_FILE_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new AppError(`Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP, AVIF`, 400, 'INVALID_FILE_TYPE'), false);
  }
};

// Configure multer instance
const upload = multer({
  storage,
  limits: {
    fileSize: config.maxFileSize, // Default: 5MB
  },
  fileFilter,
});

/**
 * Middleware for uploading single image
 * Field name: 'image'
 */
const uploadSingleImage = upload.single('image');

/**
 * Middleware for uploading multiple images
 * Field name: 'images', max 10 files
 */
const uploadMultipleImages = upload.array('images', 10);

/**
 * Middleware for uploading gallery images
 * Field name: 'gallery', max 20 files
 */
const uploadGallery = upload.array('gallery', 20);

module.exports = {
  upload,
  uploadSingleImage,
  uploadMultipleImages,
  uploadGallery,
};
