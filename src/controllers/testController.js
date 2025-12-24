const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Create a new test
const createTest = async (req, res) => {
  try {
    const { name, duration, sections } = req.body;
    const parsedSections = JSON.parse(sections);
    
    console.log('Creating test with sections:', parsedSections);
    
    // Calculate total marks
    let totalMarks = 0;
    parsedSections.forEach(section => {
      totalMarks += section.questions.length * 4; // 4 marks per question
    });
    
    console.log('Total marks calculated:', totalMarks);

    const test = await prisma.test.create({
      data: {
        name,
        duration: parseInt(duration),
        totalMarks,
        sections: {
          create: parsedSections.map((section, sectionIndex) => ({
            name: section.name,
            questionType: section.questionType,
            isIntegerType: section.isIntegerType || false,
            order: sectionIndex,
            questions: {
              create: section.questions.map((question, questionIndex) => {
                const questionImageFile = req.files?.find(f => 
                  f.fieldname === `sections[${sectionIndex}].questions[${questionIndex}].questionImage`
                );
                const solutionImageFile = req.files?.find(f => 
                  f.fieldname === `sections[${sectionIndex}].questions[${questionIndex}].solutionImage`
                );

                return {
                  questionNumber: questionIndex + 1,
                  questionImage: questionImageFile ? questionImageFile.path : null,
                  solutionImage: solutionImageFile ? solutionImageFile.path : null,
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

    res.status(201).json(test);
  } catch (error) {
    console.error('Error creating test:', error);
    res.status(500).json({ error: 'Failed to create test' });
  }
};

// Get all tests
const getAllTests = async (req, res) => {
  try {
    const tests = await prisma.test.findMany({
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

    res.json(tests);
  } catch (error) {
    console.error('Error fetching tests:', error);
    res.status(500).json({ error: 'Failed to fetch tests' });
  }
};

// Get live tests (for students)
const getLiveTests = async (req, res) => {
  try {
    const tests = await prisma.test.findMany({
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

    res.json(tests);
  } catch (error) {
    console.error('Error fetching live tests:', error);
    res.status(500).json({ error: 'Failed to fetch live tests' });
  }
};

// Get test by ID
const getTestById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const test = await prisma.test.findUnique({
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

    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    res.json(test);
  } catch (error) {
    console.error('Error fetching test:', error);
    res.status(500).json({ error: 'Failed to fetch test' });
  }
};

// Toggle test live status
const toggleTestLive = async (req, res) => {
  try {
    const { id } = req.params;
    const { isLive } = req.body;

    const updatedTest = await prisma.test.update({
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

    res.json(updatedTest);
  } catch (error) {
    console.error('Error toggling test live status:', error);
    res.status(500).json({ error: 'Failed to toggle test live status' });
  }
};

// Update test
const updateTest = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, duration, sections, isLive } = req.body;
    
    // Delete existing sections and questions
    await prisma.section.deleteMany({
      where: { testId: id }
    });

    const parsedSections = JSON.parse(sections);
    
    // Calculate total marks
    let totalMarks = 0;
    parsedSections.forEach(section => {
      totalMarks += section.questions.length * 4;
    });

    const updatedTest = await prisma.test.update({
      where: { id },
      data: {
        name,
        duration: parseInt(duration),
        totalMarks,
        isLive: isLive === 'true',
        sections: {
          create: parsedSections.map((section, sectionIndex) => ({
            name: section.name,
            questionType: section.questionType,
            isIntegerType: section.isIntegerType || false,
            order: sectionIndex,
            questions: {
              create: section.questions.map((question, questionIndex) => {
                const questionImageFile = req.files?.find(f => 
                  f.fieldname === `sections[${sectionIndex}].questions[${questionIndex}].questionImage`
                );
                const solutionImageFile = req.files?.find(f => 
                  f.fieldname === `sections[${sectionIndex}].questions[${questionIndex}].solutionImage`
                );

                return {
                  questionNumber: questionIndex + 1,
                  questionImage: questionImageFile ? questionImageFile.path : question.questionImage,
                  solutionImage: solutionImageFile ? solutionImageFile.path : question.solutionImage,
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

    res.json(updatedTest);
  } catch (error) {
    console.error('Error updating test:', error);
    res.status(500).json({ error: 'Failed to update test' });
  }
};

// Delete test
const deleteTest = async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.test.delete({
      where: { id }
    });

    res.json({ message: 'Test deleted successfully' });
  } catch (error) {
    console.error('Error deleting test:', error);
    res.status(500).json({ error: 'Failed to delete test' });
  }
};

module.exports = {
  createTest,
  getAllTests,
  getLiveTests,
  getTestById,
  updateTest,
  toggleTestLive,
  deleteTest
};