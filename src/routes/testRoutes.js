// routes/tests.js
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middlewares/authMiddleware");
const {
  generateAIQuestions,
  createTest,
  getCompanyTests,
  getSingleTest,
  updateTest,
  deleteTest,
   updateTestSchedule,
  assignTest,
  getAssignedTests,
  getUserAssignedTests,
    uploadImageVerificationPhoto,
  verifyImage,
  performSystemCheck,
  startTest,
  getStartedTestData,
  getQuestionAudio,
} = require("../controllers/testController");

const { getCandidatesByCompany } = require("../controllers/userController");
const multer = require("multer");
const upload = multer(); // using memoryStorage

// Get all tests for logged-in company
router.get("/", verifyToken, getCompanyTests);

// Generate questions with AI
router.post("/generate-ai", verifyToken, generateAIQuestions);

// Create a new test
router.post("/", verifyToken, createTest);
// routes/testRoutes.js
router.get("/assigned", verifyToken, getAssignedTests);
// For user to get their assigned tests
router.get("/user-assigned", verifyToken, getUserAssignedTests);

// ✅ NEW ROUTES
router.get("/company/candidates", verifyToken, getCandidatesByCompany); // optional alias
// Validate and Start Test
router.post("/start-test", verifyToken, startTest);

// Perform System Check
router.post("/system-check", verifyToken, performSystemCheck);

// 📸 Upload one of 3 face images (front, left, right)
router.post("/upload-image-verification", verifyToken, upload.single("image"), uploadImageVerificationPhoto);

// ✅ Final image verification after all 3 are uploaded
router.post("/verify-image", verifyToken, verifyImage);
// Deepgram TTS: Get audio for a question (no auth required for audio playback)
router.get("/:id/question-audio/:questionNo", getQuestionAudio);

router.get("/:id/start-data", verifyToken, getStartedTestData);

router.get("/:id", verifyToken, getSingleTest);
router.put("/:id", verifyToken, updateTest);
router.delete("/:id", verifyToken, deleteTest);
router.post("/:id/assign", verifyToken, assignTest);
// ✅ Update schedule (NEW)
router.put("/:id/schedule", verifyToken, updateTestSchedule);  // 👈 new route

 


module.exports = router;
