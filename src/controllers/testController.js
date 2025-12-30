const { PrismaClient } = require('@prisma/client');
const { 
  deleteImageFromCloudinary, 
  deleteMultipleImagesFromCloudinary,
  isExistingCloudinaryUrl 
} = require('../utils/cloudinaryUtils');
const { 
  handleDatabaseError, 
  retryDatabaseOperation,
  asyncHandler 
} = require('../utils/errorHandler');
const prisma = new PrismaClient();

// Create a new test
const createTest = asyncHandler(async (req, res) => {
  const { name, duration, sections, isDraft } = req.body;
  const parsedSections = JSON.parse(sections);
  
  // Calculate total marks
  let totalMarks = 0;
  parsedSections.forEach(section => {
    totalMarks += section.questions.length * 4; // 4 marks per question
  });
  
  const test = await retryDatabaseOperation(async () => {
    return await prisma.test.create({
      data: {
        name,
        duration: parseInt(duration),
        totalMarks,
        isDraft: isDraft === 'true' || isDraft === true,
        sections: {
          create: parsedSections.map((section, sectionIndex) => ({
            name: section.name,
            questionType: section.questionType,
            isIntegerType: section.isIntegerType || false,
            order: sectionIndex,
            questions: {
              create: section.questions.map((question, questionIndex) => {
                // Handle image uploads - only upload new files, preserve existing URLs
                let questionImageUrl = null;
                let solutionImageUrl = null;
                
                // Check for question image
                const questionImageFile = req.files?.find(f => 
                  f.fieldname === `sections[${sectionIndex}].questions[${questionIndex}].questionImage`
                );
                if (questionImageFile) {
                  questionImageUrl = questionImageFile.path; // New upload
                } else if (question.questionImage && isExistingCloudinaryUrl(question.questionImage)) {
                  questionImageUrl = question.questionImage; // Existing URL
                }
                
                // Check for solution image
                const solutionImageFile = req.files?.find(f => 
                  f.fieldname === `sections[${sectionIndex}].questions[${questionIndex}].solutionImage`
                );
                if (solutionImageFile) {
                  solutionImageUrl = solutionImageFile.path; // New upload
                } else if (question.solutionImage && isExistingCloudinaryUrl(question.solutionImage)) {
                  solutionImageUrl = question.solutionImage; // Existing URL
                }

                return {
                  questionNumber: questionIndex + 1,
                  questionImage: questionImageUrl,
                  solutionImage: solutionImageUrl,
                  correctOption: question.correctOption || null,
                  correctInteger: question.correctInteger ? parseInt(question.correctInteger) : null,
                  marks: 4,
                  negativeMarks: -1
                };
              })
            }
          }))
        }
      },
      include: {
        sections: {
          include: {
            questions: true
          }
        }
      }
    });
  });

  res.status(201).json(test);
});

// Get all tests
const getAllTests = asyncHandler(async (req, res) => {
  const tests = await retryDatabaseOperation(async () => {
    return await prisma.test.findMany({
      include: {
        sections: {
          include: {
            questions: {
              orderBy: { questionNumber: 'asc' }
            }
          },
          orderBy: { order: 'asc' }
        },
        attempts: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  });

  res.json(tests);
});

// Get live tests (for students)
const getLiveTests = asyncHandler(async (req, res) => {
  const tests = await retryDatabaseOperation(async () => {
    return await prisma.test.findMany({
      where: {
        isLive: true
      },
      include: {
        sections: {
          include: {
            questions: {
              orderBy: { questionNumber: 'asc' }
            }
          },
          orderBy: { order: 'asc' }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  });

  res.json(tests);
});

// Get test by ID
const getTestById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const test = await retryDatabaseOperation(async () => {
    return await prisma.test.findUnique({
      where: { id },
      include: {
        sections: {
          include: {
            questions: {
              orderBy: { questionNumber: 'asc' }
            }
          },
          orderBy: {
            order: 'asc'
          }
        }
      }
    });
  });

  if (!test) {
    return res.status(404).json({ error: 'Test not found' });
  }

  res.json(test);
});

// Toggle test live status
const toggleTestLive = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isLive } = req.body;

  const updatedTest = await retryDatabaseOperation(async () => {
    return await prisma.test.update({
      where: { id },
      data: {
        isLive: isLive === 'true' || isLive === true
      },
      include: {
        sections: {
          include: {
            questions: true
          }
        }
      }
    });
  });

  res.json(updatedTest);
});

// Update test
const updateTest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, duration, sections, isLive, isDraft } = req.body;
  
  // Get existing test with all data
  const existingTest = await retryDatabaseOperation(async () => {
    return await prisma.test.findUnique({
      where: { id },
      include: {
        sections: {
          include: {
            questions: {
              orderBy: { questionNumber: 'asc' }
            }
          },
          orderBy: { order: 'asc' }
        }
      }
    });
  });

  if (!existingTest) {
    return res.status(404).json({ error: 'Test not found' });
  }

  const parsedSections = JSON.parse(sections);
  
  // Calculate total marks
  let totalMarks = 0;
  parsedSections.forEach(section => {
    totalMarks += section.questions.length * 4;
  });

  // Collect image URLs for cleanup
  const existingImageUrls = new Set();
  const newImageUrls = new Set();
  
  existingTest.sections.forEach(section => {
    section.questions.forEach(question => {
      if (question.questionImage) existingImageUrls.add(question.questionImage);
      if (question.solutionImage) existingImageUrls.add(question.solutionImage);
    });
  });

  // Determine final draft status
  const finalIsDraft = isDraft === 'true' || isDraft === true;

  // OPTIMIZED: Only update what actually changed
  const updatedTest = await retryDatabaseOperation(async () => {
    return await prisma.$transaction(async (tx) => {
      // 1. Update basic test info (always fast)
      await tx.test.update({
        where: { id },
        data: {
          name,
          duration: parseInt(duration),
          totalMarks,
          isLive: isLive === 'true',
          isDraft: finalIsDraft,
        }
      });

      // 2. Get existing sections for comparison
      const existingSections = await tx.section.findMany({
        where: { testId: id },
        include: { 
          questions: {
            orderBy: { questionNumber: 'asc' }
          }
        },
        orderBy: { order: 'asc' }
      });

      // 3. Process each section incrementally
      for (let sectionIndex = 0; sectionIndex < parsedSections.length; sectionIndex++) {
        const newSection = parsedSections[sectionIndex];
        const existingSection = existingSections[sectionIndex];

        let currentSection;

        if (existingSection) {
          // Update existing section if changed
          if (existingSection.name !== newSection.name || 
              existingSection.questionType !== newSection.questionType) {
            currentSection = await tx.section.update({
              where: { id: existingSection.id },
              data: {
                name: newSection.name,
                questionType: newSection.questionType,
                order: sectionIndex
              }
            });
          } else {
            currentSection = existingSection;
          }
        } else {
          // Create new section
          currentSection = await tx.section.create({
            data: {
              name: newSection.name,
              questionType: newSection.questionType,
              isIntegerType: newSection.isIntegerType || false,
              order: sectionIndex,
              testId: id
            }
          });
        }

        // 4. Handle questions for this section
        const existingQuestions = existingSection?.questions || [];
        
        // Delete questions that no longer exist
        if (newSection.questions.length < existingQuestions.length) {
          const questionsToDelete = existingQuestions.slice(newSection.questions.length);
          for (const question of questionsToDelete) {
            await tx.question.delete({ where: { id: question.id } });
          }
        }

        // Update/create questions
        for (let questionIndex = 0; questionIndex < newSection.questions.length; questionIndex++) {
          const newQuestion = newSection.questions[questionIndex];
          const existingQuestion = existingQuestions[questionIndex];

          // Handle image processing
          let questionImageUrl = null;
          let solutionImageUrl = null;
          
          // Check for new question image upload
          const questionImageFile = req.files?.find(f => 
            f.fieldname === `sections[${sectionIndex}].questions[${questionIndex}].questionImage`
          );
          if (questionImageFile) {
            questionImageUrl = questionImageFile.path;
          } else if (newQuestion.questionImage && isExistingCloudinaryUrl(newQuestion.questionImage)) {
            questionImageUrl = newQuestion.questionImage;
            newImageUrls.add(questionImageUrl);
          }
          
          // Check for new solution image upload
          const solutionImageFile = req.files?.find(f => 
            f.fieldname === `sections[${sectionIndex}].questions[${questionIndex}].solutionImage`
          );
          if (solutionImageFile) {
            solutionImageUrl = solutionImageFile.path;
          } else if (newQuestion.solutionImage && isExistingCloudinaryUrl(newQuestion.solutionImage)) {
            solutionImageUrl = newQuestion.solutionImage;
            newImageUrls.add(solutionImageUrl);
          }

          // Add new uploads to preserved set
          if (questionImageUrl && !newImageUrls.has(questionImageUrl)) {
            newImageUrls.add(questionImageUrl);
          }
          if (solutionImageUrl && !newImageUrls.has(solutionImageUrl)) {
            newImageUrls.add(solutionImageUrl);
          }

          const questionData = {
            questionNumber: questionIndex + 1, // CRITICAL: Always maintain correct order
            questionImage: questionImageUrl,
            solutionImage: solutionImageUrl,
            correctOption: newQuestion.correctOption || null,
            correctInteger: newQuestion.correctInteger ? parseInt(newQuestion.correctInteger) : null,
            marks: 4,
            negativeMarks: -1
          };

          if (existingQuestion) {
            // ALWAYS update existing question to ensure correct order and data
            // Don't check for changes - just update to maintain consistency
            await tx.question.update({
              where: { id: existingQuestion.id },
              data: questionData
            });
          } else {
            // Create new question
            await tx.question.create({
              data: {
                ...questionData,
                sectionId: currentSection.id
              }
            });
          }
        }
      }

      // 5. Delete any extra sections
      if (parsedSections.length < existingSections.length) {
        const sectionsToDelete = existingSections.slice(parsedSections.length);
        for (const section of sectionsToDelete) {
          await tx.section.delete({ where: { id: section.id } });
        }
      }

      // 6. Return the complete updated test with proper ordering
      return await tx.test.findUnique({
        where: { id },
        include: {
          sections: {
            include: {
              questions: {
                orderBy: { questionNumber: 'asc' } // CRITICAL: Order by question number
              }
            },
            orderBy: { order: 'asc' }
          }
        }
      });
    });
  });

  // Clean up orphaned images
  const orphanedImages = Array.from(existingImageUrls).filter(url => !newImageUrls.has(url));
  if (orphanedImages.length > 0) {
    try {
      await deleteMultipleImagesFromCloudinary(orphanedImages);
    } catch (cleanupError) {
      console.error('Error cleaning up orphaned images:', cleanupError);
    }
  }

  res.json(updatedTest);
});

// Delete test
const deleteTest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Get test with all related data before deletion
  const testToDelete = await retryDatabaseOperation(async () => {
    return await prisma.test.findUnique({
      where: { id },
      include: {
        sections: {
          include: {
            questions: true
          }
        },
        attempts: {
          include: {
            answers: true
          }
        }
      }
    });
  });

  if (!testToDelete) {
    return res.status(404).json({ error: 'Test not found' });
  }

  // Collect statistics before deletion
  const stats = {
    testName: testToDelete.name,
    sectionsCount: testToDelete.sections.length,
    questionsCount: testToDelete.sections.reduce((total, section) => total + section.questions.length, 0),
    attemptsCount: testToDelete.attempts.length,
    answersCount: testToDelete.attempts.reduce((total, attempt) => total + attempt.answers.length, 0),
    imagesCount: 0
  };

  // Collect all image URLs for deletion
  const imageUrls = [];
  testToDelete.sections.forEach(section => {
    section.questions.forEach(question => {
      if (question.questionImage) {
        imageUrls.push(question.questionImage);
        stats.imagesCount++;
      }
      if (question.solutionImage) {
        imageUrls.push(question.solutionImage);
        stats.imagesCount++;
      }
    });
  });

  // Delete test from database (cascade will delete all related data)
  await retryDatabaseOperation(async () => {
    return await prisma.test.delete({
      where: { id }
    });
  });

  // Delete all associated images from Cloudinary
  let deleteResult = { success: 0, failed: 0 };
  if (imageUrls.length > 0) {
    try {
      deleteResult = await deleteMultipleImagesFromCloudinary(imageUrls);
    } catch (imageError) {
      console.error('Error deleting images from Cloudinary:', imageError);
      // Don't fail the request if image deletion fails
    }
  }

  res.json({ 
    message: 'Test and all related data deleted successfully',
    deletedData: {
      testName: stats.testName,
      sections: stats.sectionsCount,
      questions: stats.questionsCount,
      studentAttempts: stats.attemptsCount,
      studentAnswers: stats.answersCount,
      images: {
        total: stats.imagesCount,
        deleted: deleteResult.success,
        failed: deleteResult.failed
      }
    }
  });
});

module.exports = {
  createTest,
  getAllTests,
  getLiveTests,
  getTestById,
  updateTest,
  toggleTestLive,
  deleteTest
};