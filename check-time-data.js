const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTimeData() {
  try {
    // Get the most recent test attempt
    const recentAttempt = await prisma.testAttempt.findFirst({
      orderBy: { startTime: 'desc' },
      include: {
        answers: {
          select: {
            questionId: true,
            timeSpent: true,
            visitCount: true,
            firstVisitTime: true,
            lastVisitTime: true
          }
        }
      }
    });
    
    if (!recentAttempt) {
      console.log('❌ No test attempts found');
      return;
    }
    
    console.log('📊 Most recent attempt:', recentAttempt.id);
    console.log('👤 Candidate:', recentAttempt.candidateName);
    console.log('🕐 Start time:', recentAttempt.startTime);
    console.log('✅ Completed:', recentAttempt.isCompleted);
    
    const answersWithTime = recentAttempt.answers.filter(a => a.timeSpent > 0);
    console.log('⏱️  Answers with time data:', answersWithTime.length, '/', recentAttempt.answers.length);
    
    if (answersWithTime.length > 0) {
      console.log('📈 Sample time data:');
      answersWithTime.slice(0, 5).forEach((answer, index) => {
        console.log(`   ${index + 1}. Question: ${answer.questionId.slice(-8)} | Time: ${answer.timeSpent}s | Visits: ${answer.visitCount}`);
      });
    } else {
      console.log('❌ No time data found in answers');
      console.log('🔍 Checking first few answers for any data:');
      recentAttempt.answers.slice(0, 3).forEach((answer, index) => {
        console.log(`   ${index + 1}. Question: ${answer.questionId.slice(-8)} | Time: ${answer.timeSpent} | Visits: ${answer.visitCount} | First: ${answer.firstVisitTime} | Last: ${answer.lastVisitTime}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkTimeData();