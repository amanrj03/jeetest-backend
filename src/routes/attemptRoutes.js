const express = require('express');
const {
  startTestAttempt,
  syncAnswers,
  submitTest,
  getAttemptById,
  getUserAttempts,
  updateWarningCount,
  requestResume,
  allowResume,
  getResumeRequests,
  updateQuestionTime,
  syncTimeData,
  getTimeAnalytics
} = require('../controllers/attemptController');

const router = express.Router();

// Routes
router.post('/start', startTestAttempt);
router.post('/sync', syncAnswers);
router.post('/submit', submitTest);
router.post('/warning', updateWarningCount);

// Time tracking routes
router.put('/:id/question-time', updateQuestionTime);
router.put('/:id/sync-times', syncTimeData);
router.get('/:id/time-analytics', getTimeAnalytics);

// Resume permission routes (must be before /:id route)
router.post('/request-resume', requestResume);
router.post('/allow-resume', allowResume);
router.get('/resume-requests', getResumeRequests);

// Parameterized routes (must be last)
router.get('/user/:candidateName', getUserAttempts);
router.get('/:id', getAttemptById);

module.exports = router;