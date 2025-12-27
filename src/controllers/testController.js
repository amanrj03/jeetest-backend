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
            questions: true
          }
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
            questions: true
          }
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
            questions: true
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
  
  console.log('🔍 UpdateTest - Received isDraft:', isDraft, 'type:', typeof isDraft);
  
  // Get existing test with all images for cleanup
  const existingTest = await retryDatabaseOperation(async () => {
    return await prisma.test.findUnique({
      where: { id },
      include: {
        sections: {
          include: {
            questions: true
          }
        }
      }
    });
  });

  if (!existingTest) {
    return res.status(404).json({ error: 'Test not found' });
  }

  console.log('🔍 Existing test isDraft:', existingTest.isDraft);

  // Collect all existing image URLs for potential cleanup
  const existingImageUrls = [];
  existingTest.sections.forEach(section => {
    section.questions.forEach(question => {
      if (question.questionImage) existingImageUrls.push(question.questionImage);
      if (question.solutionImage) existingImageUrls.push(question.solutionImage);
    });
  });

  const parsedSections = JSON.parse(sections);
  
  // Calculate total marks
  let totalMarks = 0;
  parsedSections.forEach(section => {
    totalMarks += section.questions.length * 4;
  });

  // Collect new image URLs to preserve them from deletion
  const newImageUrls = new Set();
  
  // Process sections and handle image uploads/preservation
  const processedSections = parsedSections.map((section, sectionIndex) => ({
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
          newImageUrls.add(questionImageUrl); // Mark as preserved
        }
        
        // Check for solution image
        const solutionImageFile = req.files?.find(f => 
          f.fieldname === `sections[${sectionIndex}].questions[${questionIndex}].solutionImage`
        );
        if (solutionImageFile) {
          solutionImageUrl = solutionImageFile.path; // New upload
        } else if (question.solutionImage && isExistingCloudinaryUrl(question.solutionImage)) {
          solutionImageUrl = question.solutionImage; // Existing URL
          newImageUrls.add(solutionImageUrl); // Mark as preserved
        }

        // Add new uploads to preserved set
        if (questionImageUrl && !newImageUrls.has(questionImageUrl)) {
          newImageUrls.add(questionImageUrl);
        }
        if (solutionImageUrl && !newImageUrls.has(solutionImageUrl)) {
          newImageUrls.add(solutionImageUrl);
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
  }));

  // Determine final draft status
  const finalIsDraft = isDraft === 'true' || isDraft === true;
  console.log('🔍 Final isDraft value:', finalIsDraft);

  // Update test with retry logic
  const updatedTest = await retryDatabaseOperation(async () => {
    // Delete existing sections and questions (this will trigger cascade delete)
    await prisma.section.deleteMany({
      where: { testId: id }
    });

    // Update test with new data
    return await prisma.test.update({
      where: { id },
      data: {
        name,
        duration: parseInt(duration),
        totalMarks,
        isLive: isLive === 'true',
        isDraft: finalIsDraft,
        sections: {
          create: processedSections
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

  console.log('🔍 Updated test isDraft:', updatedTest.isDraft);

  // Clean up orphaned images (existing images not used in updated test)
  const orphanedImages = existingImageUrls.filter(url => !newImageUrls.has(url));
  if (orphanedImages.length > 0) {
    console.log(`Cleaning up ${orphanedImages.length} orphaned images...`);
    try {
      const deleteResult = await deleteMultipleImagesFromCloudinary(orphanedImages);
      console.log(`Cleanup result: ${deleteResult.success} deleted, ${deleteResult.failed} failed`);
    } catch (cleanupError) {
      console.error('Error cleaning up orphaned images:', cleanupError);
      // Don't fail the request if image cleanup fails
    }
  }

  res.json(updatedTest);
});

// Delete test
const deleteTest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Get test with all images before deletion
  const testToDelete = await retryDatabaseOperation(async () => {
    return await prisma.test.findUnique({
      where: { id },
      include: {
        sections: {
          include: {
            questions: true
          }
        }
      }
    });
  });

  if (!testToDelete) {
    return res.status(404).json({ error: 'Test not found' });
  }

  // Collect all image URLs for deletion
  const imageUrls = [];
  testToDelete.sections.forEach(section => {
    section.questions.forEach(question => {
      if (question.questionImage) imageUrls.push(question.questionImage);
      if (question.solutionImage) imageUrls.push(question.solutionImage);
    });
  });

  // Delete test from database (cascade will delete sections and questions)
  await retryDatabaseOperation(async () => {
    return await prisma.test.delete({
      where: { id }
    });
  });

  // Delete all associated images from Cloudinary
  let deleteResult = { success: 0, failed: 0 };
  if (imageUrls.length > 0) {
    console.log(`Deleting ${imageUrls.length} images from Cloudinary for test: ${testToDelete.name}`);
    try {
      deleteResult = await deleteMultipleImagesFromCloudinary(imageUrls);
      console.log(`Image deletion result: ${deleteResult.success} deleted, ${deleteResult.failed} failed`);
    } catch (imageError) {
      console.error('Error deleting images from Cloudinary:', imageError);
      // Don't fail the request if image deletion fails
    }
  }

  res.json({ 
    message: 'Test deleted successfully',
    imagesDeleted: imageUrls.length > 0 ? {
      total: imageUrls.length,
      success: deleteResult.success,
      failed: deleteResult.failed
    } : null
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