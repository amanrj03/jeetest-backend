const express = require('express');
const multer = require('multer');
const { storage } = require('../config/cloudinary');
const { 
  createTest, 
  getAllTests, 
  getTestById, 
  updateTest, 
  toggleTestLive,
  deleteTest,
  getLiveTests 
} = require('../controllers/testController');

const router = express.Router();

// Configure multer with Cloudinary storage
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for better quality
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (JPEG, JPG, PNG, GIF)'));
    }
  }
});

// Routes
router.post('/', upload.any(), createTest);
router.get('/', getAllTests);
router.get('/live', getLiveTests);
router.get('/:id', getTestById);
router.put('/:id', upload.any(), updateTest);
router.patch('/:id/toggle-live', toggleTestLive);
router.delete('/:id', deleteTest);

module.exports = router;