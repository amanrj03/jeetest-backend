const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'jee-test-platform', // Folder name in Cloudinary
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
    transformation: [
      { width: 1200, height: 800, crop: 'limit' }, // Optimize image size
      { quality: 'auto' } // Auto quality optimization
    ],
    public_id: (req, file) => {
      // Generate clean public ID
      const timestamp = Date.now();
      const random = Math.round(Math.random() * 1E9);
      const imageType = file.fieldname.includes('questionImage') ? 'question' : 'solution';
      return `${imageType}-${timestamp}-${random}`;
    },
  },
});

module.exports = { cloudinary, storage };