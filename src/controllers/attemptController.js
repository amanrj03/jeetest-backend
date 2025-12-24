const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Start a test attempt
const startTestAttempt = async (req, res) => {
  try {
    const { testId, candidateName, candidateImage } = req.body;

    // Check if test exists and is live
    const test = await prisma.test.findUnique({
      where: { id: testId },
      include: {
        sections: {
          include: {
            questions: true
          }
        }
      }
    });

    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    if (!test.isLive) {
      return res.status(400).json({ error: 'Test is not live' });
    }

    // Check if user has already attempted this test
    const existingAttempt = await prisma.testAttempt.findFirst({
      where: {
        testId,
        candidateName
      }
    });

    if (existingAttempt) {
      if (existingAttempt.isCompleted) {
        return res.status(400).json({ error: 'You have already completed this test' });
      }
      
      // If attempt exists but not completed, check if resume permission is needed
      if (existingAttempt.needsResume && !existingAttempt.canResume) {
        return res.status(403).json({ 
          error: 'Resume permission required',
          attemptId: existingAttempt.id,
          needsResume: true
        });
      }
      
      // If can resume or no resume needed, delete old attempt and create fresh one
      await prisma.testAttempt.delete({
        where: { id: existingAttempt.id }
      });
    }

    // Create fresh test attempt (always starts new)
    const attempt = await prisma.testAttempt.create({
      data: {
        testId,
        candidateName,
        candidateImage,
        answers: {
          create: test.sections.flatMap(section =>
            section.questions.map(question => ({
              questionId: question.id,
              status: 'NOT_VISITED'
            }))
          )
        }
      },
      include: {
        test: {
          include: {
            sections: {
              include: {
                questions: true
              },
              orderBy: {
                order: 'asc'
              }
            }
          }
        },
        answers: {
          include: {
            question: true
          }
        }
      }
    });

    res.status(201).json(attempt);
  } catch (error) {
    console.error('Error starting test attempt:', error);
    res.status(500).json({ error: 'Failed to start test attempt' });
  }
};

// Sync answers (called every 15 seconds)
const syncAnswers = async (req, res) => {
  try {
    const { attemptId, answers } = req.body;

    // Update answers in batch
    const updatePromises = answers.map(answer => 
      prisma.answer.update({
        where: {
          attemptId_questionId: {
            attemptId,
            questionId: answer.questionId
          }
        },
        data: {
          selectedOption: answer.selectedOption,
          integerAnswer: answer.integerAnswer !== null && answer.integerAnswer !== undefined && answer.integerAnswer !== '' ? parseInt(answer.integerAnswer) : null,
          status: answer.status
        }
      })
    );

    await Promise.all(updatePromises);

    res.json({ success: true, synced: answers.length });
  } catch (error) {
    console.error('Error syncing answers:', error);
    res.status(500).json({ error: 'Failed to sync answers' });
  }
};

// Submit test
const submitTest = async (req, res) => {
  try {
    const { attemptId, answers } = req.body;

    // Get the attempt with test details
    const attempt = await prisma.testAttempt.findUnique({
      where: { id: attemptId },
      include: {
        test: {
          include: {
            sections: {
              include: {
                questions: true
              }
            }
          }
        },
        answers: {
          include: {
            question: true
          }
        }
      }
    });

    if (!attempt) {
      return res.status(404).json({ error: 'Test attempt not found' });
    }

    // Calculate marks
    let totalMarks = 0;
    const updatedAnswers = [];

    for (const answer of answers) {
      const question = attempt.test.sections
        .flatMap(s => s.questions)
        .find(q => q.id === answer.questionId);

      if (!question) continue;

      let isCorrect = null; // null = unattempted, true = correct, false = wrong
      let marksAwarded = 0;

      if (answer.status === 'ANSWERED' || answer.status === 'MARKED_FOR_REVIEW') {
        // Check if the answer is correct
        if (question.correctOption && question.correctOption !== '' && answer.selectedOption === question.correctOption) {
          isCorrect = true;
          marksAwarded = question.marks;
        } else if (question.correctInteger !== null && question.correctInteger !== undefined && answer.integerAnswer === question.correctInteger) {
          isCorrect = true;
          marksAwarded = question.marks;
        } else if (answer.selectedOption || (answer.integerAnswer !== null && answer.integerAnswer !== undefined)) {
          // Student provided an answer but it's wrong
          isCorrect = false;
          marksAwarded = question.negativeMarks;
        }
        // If no answer provided, isCorrect remains null and marksAwarded remains 0
      }

      totalMarks += marksAwarded;

      updatedAnswers.push({
        attemptId,
        questionId: answer.questionId,
        selectedOption: answer.selectedOption,
        integerAnswer: answer.integerAnswer !== null && answer.integerAnswer !== undefined && answer.integerAnswer !== '' ? parseInt(answer.integerAnswer) : null,
        status: answer.status,
        isCorrect,
        marksAwarded
      });
    }

    // Update all answers with marks
    const updatePromises = updatedAnswers.map(answer =>
      prisma.answer.update({
        where: {
          attemptId_questionId: {
            attemptId: answer.attemptId,
            questionId: answer.questionId
          }
        },
        data: {
          selectedOption: answer.selectedOption,
          integerAnswer: answer.integerAnswer,
          status: answer.status,
          isCorrect: answer.isCorrect,
          marksAwarded: answer.marksAwarded
        }
      })
    );

    await Promise.all(updatePromises);

    // Mark attempt as completed
    const completedAttempt = await prisma.testAttempt.update({
      where: { id: attemptId },
      data: {
        isCompleted: true,
        totalMarks,
        endTime: new Date()
      },
      include: {
        test: true,
        answers: {
          include: {
            question: {
              include: {
                section: true
              }
            }
          }
        }
      }
    });

    // Automatically stop the test from being live when student completes it
    // This is for single student use - test should move to attempted tests
    await prisma.test.update({
      where: { id: completedAttempt.testId },
      data: { isLive: false }
    });

    console.log(`Test ${completedAttempt.test.name} automatically stopped after completion by ${completedAttempt.candidateName}`);

    res.json(completedAttempt);
  } catch (error) {
    console.error('Error submitting test:', error);
    res.status(500).json({ error: 'Failed to submit test' });
  }
};

// Update warning count
const updateWarningCount = async (req, res) => {
  try {
    const { attemptId } = req.body;

    const attempt = await prisma.testAttempt.update({
      where: { id: attemptId },
      data: {
        warningCount: {
          increment: 1
        }
      }
    });

    // Auto-submit if warning count reaches 5
    if (attempt.warningCount >= 5) {
      // Get current answers and submit
      const currentAnswers = await prisma.answer.findMany({
        where: { attemptId }
      });

      await submitTest({ body: { attemptId, answers: currentAnswers } }, res);
      return;
    }

    res.json({ warningCount: attempt.warningCount });
  } catch (error) {
    console.error('Error updating warning count:', error);
    res.status(500).json({ error: 'Failed to update warning count' });
  }
};

// Get attempt by ID
const getAttemptById = async (req, res) => {
  try {
    const { id } = req.params;

    const attempt = await prisma.testAttempt.findUnique({
      where: { id },
      include: {
        test: {
          include: {
            sections: {
              include: {
                questions: true
              },
              orderBy: {
                order: 'asc'
              }
            }
          }
        },
        answers: {
          include: {
            question: {
              include: {
                section: true
              }
            }
          }
        }
      }
    });

    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    res.json(attempt);
  } catch (error) {
    console.error('Error fetching attempt:', error);
    res.status(500).json({ error: 'Failed to fetch attempt' });
  }
};

// Get user attempts
const getUserAttempts = async (req, res) => {
  try {
    const { candidateName } = req.params;

    const attempts = await prisma.testAttempt.findMany({
      where: {
        candidateName,
        isCompleted: true
      },
      include: {
        test: {
          include: {
            sections: {
              include: {
                questions: true
              }
            }
          }
        },
        answers: true
      },
      orderBy: {
        endTime: 'desc'
      }
    });

    res.json(attempts);
  } catch (error) {
    console.error('Error fetching user attempts:', error);
    res.status(500).json({ error: 'Failed to fetch user attempts' });
  }
};

module.exports = {
  startTestAttempt,
  syncAnswers,
  submitTest,
  updateWarningCount,
  getAttemptById,
  getUserAttempts
};

// Request resume permission (when student closes tab)
const requestResume = async (req, res) => {
  try {
    const { attemptId } = req.body;

    await prisma.testAttempt.update({
      where: { id: attemptId },
      data: {
        needsResume: true,
        resumeRequestedAt: new Date()
      }
    });

    res.json({ success: true, message: 'Resume permission requested' });
  } catch (error) {
    console.error('Error requesting resume:', error);
    res.status(500).json({ error: 'Failed to request resume permission' });
  }
};

// Allow resume (creator grants permission)
const allowResume = async (req, res) => {
  try {
    const { attemptId } = req.body;

    await prisma.testAttempt.update({
      where: { id: attemptId },
      data: {
        canResume: true,
        needsResume: false
      }
    });

    res.json({ success: true, message: 'Resume permission granted' });
  } catch (error) {
    console.error('Error allowing resume:', error);
    res.status(500).json({ error: 'Failed to allow resume' });
  }
};

// Get attempts needing resume permission
const getResumeRequests = async (req, res) => {
  try {
    const attempts = await prisma.testAttempt.findMany({
      where: {
        needsResume: true,
        canResume: false,
        isCompleted: false
      },
      include: {
        test: true
      },
      orderBy: {
        resumeRequestedAt: 'desc'
      }
    });

    res.json(attempts);
  } catch (error) {
    console.error('Error fetching resume requests:', error);
    res.status(500).json({ error: 'Failed to fetch resume requests' });
  }
};

module.exports = {
  startTestAttempt,
  syncAnswers,
  submitTest,
  updateWarningCount,
  getAttemptById,
  getUserAttempts,
  requestResume,
  allowResume,
  getResumeRequests
};