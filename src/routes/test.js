// routes/tests.js
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middlewares/authMiddleware");
const {
  generateAIQuestions,
  createTest,
  getCompanyTests
} = require("../controllers/testController");

// Get all tests for logged-in company
router.get("/", verifyToken, getCompanyTests);

// Generate questions with AI
router.post("/generate-ai", verifyToken, generateAIQuestions);

// Create a new test
router.post("/", verifyToken, createTest);

module.exports = router;
