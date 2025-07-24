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
   
  assignTest
} = require("../controllers/testController");

const { getCandidatesByCompany } = require("../controllers/userController");

// Get all tests for logged-in company
router.get("/", verifyToken, getCompanyTests);

// Generate questions with AI
router.post("/generate-ai", verifyToken, generateAIQuestions);

// Create a new test
router.post("/", verifyToken, createTest);

// ✅ NEW ROUTES
router.get("/:id", verifyToken, getSingleTest);
router.put("/:id", verifyToken, updateTest);
router.delete("/:id", verifyToken, deleteTest);
router.get("/company/candidates", verifyToken, getCandidatesByCompany); // optional alias
router.post("/:id/assign", verifyToken, assignTest);


module.exports = router;
