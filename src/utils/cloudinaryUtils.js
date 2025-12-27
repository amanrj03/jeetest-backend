const cloudinary = require('cloudinary').v2;

/**
 * Extract public ID from Cloudinary URL
 * @param {string} cloudinaryUrl - Full Cloudinary URL
 * @returns {string} - Public ID for deletion
 */
function extractPublicIdFromUrl(cloudinaryUrl) {
  if (!cloudinaryUrl || typeof cloudinaryUrl !== 'string') {
    return null;
  }
  
  try {
    // Example URL: https://res.cloudinary.com/demo/image/upload/v1234567890/jee-test-platform/abc123.jpg
    // We need to extract: jee-test-platform/abc123
    
    const urlParts = cloudinaryUrl.split('/');
    const uploadIndex = urlParts.findIndex(part => part === 'upload');
    
    if (uploadIndex === -1) return null;
    
    // Get everything after 'upload/v{version}/' or 'upload/'
    let pathAfterUpload = urlParts.slice(uploadIndex + 1);
    
    // Remove version if present (starts with 'v' followed by numbers)
    if (pathAfterUpload[0] && /^v\d+$/.test(pathAfterUpload[0])) {
      pathAfterUpload = pathAfterUpload.slice(1);
    }
    
    // Join the remaining parts and remove file extension
    const fullPath = pathAfterUpload.join('/');
    const publicId = fullPath.replace(/\.[^/.]+$/, ''); // Remove file extension
    
    return publicId;
  } catch (error) {
    console.error('Error extracting public ID from URL:', cloudinaryUrl, error);
    return null;
  }
}

/**
 * Delete a single image from Cloudinary
 * @param {string} imageUrl - Cloudinary URL to delete
 * @returns {Promise<boolean>} - Success status
 */
async function deleteImageFromCloudinary(imageUrl) {
  if (!imageUrl) return true;
  
  try {
    const publicId = extractPublicIdFromUrl(imageUrl);
    if (!publicId) {
      console.warn('Could not extract public ID from URL:', imageUrl);
      return false;
    }
    
    const result = await cloudinary.uploader.destroy(publicId);
    console.log(`Deleted image ${publicId}:`, result);
    return result.result === 'ok' || result.result === 'not found';
  } catch (error) {
    console.error('Error deleting image from Cloudinary:', imageUrl, error);
    return false;
  }
}

/**
 * Delete multiple images from Cloudinary
 * @param {string[]} imageUrls - Array of Cloudinary URLs to delete
 * @returns {Promise<{success: number, failed: number}>} - Deletion results
 */
async function deleteMultipleImagesFromCloudinary(imageUrls) {
  if (!imageUrls || imageUrls.length === 0) {
    return { success: 0, failed: 0 };
  }
  
  const validUrls = imageUrls.filter(url => url && typeof url === 'string');
  const publicIds = validUrls.map(url => extractPublicIdFromUrl(url)).filter(id => id);
  
  if (publicIds.length === 0) {
    return { success: 0, failed: 0 };
  }
  
  try {
    // Delete in batches of 100 (Cloudinary limit)
    const batchSize = 100;
    let totalSuccess = 0;
    let totalFailed = 0;
    
    for (let i = 0; i < publicIds.length; i += batchSize) {
      const batch = publicIds.slice(i, i + batchSize);
      
      try {
        const result = await cloudinary.api.delete_resources(batch);
        
        // Count successful and failed deletions
        Object.values(result.deleted || {}).forEach(status => {
          if (status === 'deleted' || status === 'not_found') {
            totalSuccess++;
          } else {
            totalFailed++;
          }
        });
        
        console.log(`Batch deletion result for ${batch.length} images:`, result);
      } catch (batchError) {
        console.error('Error in batch deletion:', batchError);
        totalFailed += batch.length;
      }
    }
    
    return { success: totalSuccess, failed: totalFailed };
  } catch (error) {
    console.error('Error deleting multiple images from Cloudinary:', error);
    return { success: 0, failed: publicIds.length };
  }
}

/**
 * Check if a value is a File object (new upload) or URL string (existing image)
 * @param {any} value - Value to check
 * @returns {boolean} - True if it's a new file upload
 */
function isNewFileUpload(value) {
  // In the backend, multer files have specific properties
  return value && typeof value === 'object' && value.fieldname && value.originalname;
}

/**
 * Check if a value is an existing Cloudinary URL
 * @param {any} value - Value to check
 * @returns {boolean} - True if it's an existing URL
 */
function isExistingCloudinaryUrl(value) {
  return typeof value === 'string' && value.includes('cloudinary.com');
}

module.exports = {
  extractPublicIdFromUrl,
  deleteImageFromCloudinary,
  deleteMultipleImagesFromCloudinary,
  isNewFileUpload,
  isExistingCloudinaryUrl
};