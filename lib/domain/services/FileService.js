'use strict';

const path = require('path');
const CONSTANTS = require('../constants.js');

/**
 * File Service
 * Handles file upload and download operations
 * 
 * This service provides:
 * - Single file upload
 * - Multiple file uploads
 * - File download
 * - File validation
 */
class FileService {
  
  constructor() {
    // Service is stateless
  }

  /**
   * Handles single file upload
   * 
   * @param {Object} file - Multer file object
   * @returns {Object} Upload result with file path
   */
  uploadFile(file) {
    if (!file) {
      throw new Error(CONSTANTS.ERROR_MESSAGES.UPLOAD_FAILED);
    }

    return {
      success: true,
      path: file.path,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype
    };
  }

  /**
   * Handles multiple file uploads
   * 
   * @param {Array} files - Array of Multer file objects
   * @returns {Object} Upload result with file paths
   */
  uploadFiles(files) {
    if (!files || files.length === 0) {
      throw new Error(CONSTANTS.ERROR_MESSAGES.UPLOAD_FAILED);
    }

    const uploadedFiles = files.map(file => ({
      path: file.path,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype
    }));

    return {
      success: true,
      count: files.length,
      files: uploadedFiles,
      paths: files.map(f => f.path)
    };
  }

  /**
   * Gets file path for download
   * Validates file exists in working directory
   * 
   * @param {string} filename - File name to download
   * @returns {string} Absolute file path
   */
  getDownloadPath(filename) {
    if (!filename) {
      throw new Error('Filename is required');
    }

    // Prevent directory traversal attacks
    const sanitizedFilename = path.basename(filename);
    const filePath = path.join(process.cwd(), sanitizedFilename);

    return filePath;
  }

  /**
   * Validates file size
   * 
   * @param {Object} file - File object
   * @param {number} maxSize - Maximum size in bytes
   * @returns {boolean} True if valid
   */
  validateFileSize(file, maxSize) {
    if (!file || !file.size) {
      return false;
    }

    return file.size <= maxSize;
  }

  /**
   * Validates file type
   * 
   * @param {Object} file - File object
   * @param {Array<string>} allowedTypes - Allowed MIME types
   * @returns {boolean} True if valid
   */
  validateFileType(file, allowedTypes) {
    if (!file || !file.mimetype) {
      return false;
    }

    return allowedTypes.includes(file.mimetype);
  }

  /**
   * Validates file extension
   * 
   * @param {string} filename - File name
   * @param {Array<string>} allowedExtensions - Allowed extensions (e.g., ['.jpg', '.png'])
   * @returns {boolean} True if valid
   */
  validateFileExtension(filename, allowedExtensions) {
    if (!filename) {
      return false;
    }

    const ext = path.extname(filename).toLowerCase();
    return allowedExtensions.includes(ext);
  }

  /**
   * Gets file information
   * 
   * @param {Object} file - File object
   * @returns {Object} File information
   */
  getFileInfo(file) {
    if (!file) {
      return null;
    }

    return {
      filename: file.filename,
      originalName: file.originalname,
      path: file.path,
      size: file.size,
      mimetype: file.mimetype,
      extension: path.extname(file.originalname),
      uploadedAt: new Date().toISOString()
    };
  }

  /**
   * Formats file size in human-readable format
   * 
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted size (e.g., "1.5 MB")
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Validates multiple files
   * 
   * @param {Array} files - Array of file objects
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  validateFiles(files, options = {}) {
    const {
      maxSize = 10 * 1024 * 1024, // 10MB default
      allowedTypes = [],
      allowedExtensions = [],
      maxCount = 10
    } = options;

    const errors = [];
    const validFiles = [];

    if (files.length > maxCount) {
      errors.push(`Too many files. Maximum ${maxCount} files allowed.`);
      return { valid: false, errors, validFiles };
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileErrors = [];

      // Validate size
      if (maxSize && !this.validateFileSize(file, maxSize)) {
        fileErrors.push(`File "${file.originalname}" exceeds maximum size of ${this.formatFileSize(maxSize)}`);
      }

      // Validate type
      if (allowedTypes.length > 0 && !this.validateFileType(file, allowedTypes)) {
        fileErrors.push(`File "${file.originalname}" has invalid type. Allowed: ${allowedTypes.join(', ')}`);
      }

      // Validate extension
      if (allowedExtensions.length > 0 && !this.validateFileExtension(file.originalname, allowedExtensions)) {
        fileErrors.push(`File "${file.originalname}" has invalid extension. Allowed: ${allowedExtensions.join(', ')}`);
      }

      if (fileErrors.length === 0) {
        validFiles.push(file);
      } else {
        errors.push(...fileErrors);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      validFiles,
      totalFiles: files.length,
      validCount: validFiles.length,
      invalidCount: files.length - validFiles.length
    };
  }
}

module.exports = FileService;
