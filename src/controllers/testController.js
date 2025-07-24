// controllers/testController.js
const OpenAI = require("openai"); // no destructuring
// const Test = require("../models/Test");
const Question = require("../models/Question");
const TestMaster = require("../models/TestMaster");
const User = require("../models/User");
const Test = require("../models/Test"); // <-- your Sequelize model for `tests`
// ✅ Set up OpenAI (replace later with Gemini)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ------------------ Generate Questions ------------------
exports.generateAIQuestions = async (req, res) => {
  try {
    if (req.auth.role !== "company") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { role, sector, description, difficulty } = req.body;

    if (!role || !sector || !description) {
      return res.status(400).json({
        message:
          "Role, sector, and description are required to generate AI questions.",
      });
    }

    const prompt = `Generate 50 ${
      difficulty || "medium"
    }-level multiple-choice interview questions (without answers) for the following job:
      Job Role: ${role}
  Sector: ${sector}
  Job Description: ${description}
  Return only the questions in a numbered list, no extra text.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are an expert HR and interviewer." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const raw = completion.choices[0].message.content;
    const questions = raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.replace(/^\d+[\.\)]\s*/, "").trim());

    return res.json({ questions });
  } catch (err) {
    console.error("AI error:", err);
    return res.status(500).json({ message: "AI generation failed" });
  }
};

// ------------------ Create Test ------------------
exports.createTest = async (req, res) => {
  try {
    if (req.auth.role !== "company") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { name, role, sector, description, duration, questions } = req.body;

    // validate
    if (!name || !role || !sector || !duration || !Array.isArray(questions)) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    // filter and clean questions
    const cleanQuestions = questions.filter(
      (q) => typeof q === "string" && q.trim() !== ""
    );

    if (cleanQuestions.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one valid question is required." });
    }

    // create test in test_master
    const test = await TestMaster.create({
      title: name,
      job_role: role,
      job_sector: sector,
      description: description || null,
      duration,
      status: "active",
      company_id: req.auth.id,
    });

    // prepare records with text & source_type
    const questionRecords = cleanQuestions.map((q, idx) => ({
      test_id: test.test_id,
      text: q.trim(),
      source_type: "admin",
      order_no: idx + 1,
    }));

    console.log("✅ questionRecords preview:", questionRecords[0]);

    await Question.bulkCreate(questionRecords);

    return res.status(201).json({
      message: "✅ Test created successfully!",
      test_id: test.test_id,
    });
  } catch (err) {
    console.error("❌ Create test error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// ------------------ Get All Tests ------------------
exports.getCompanyTests = async (req, res) => {
  try {
    if (req.auth.role !== "company") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // fetch only this company's tests
    const tests = await TestMaster.findAll({
      where: { company_id: req.auth.id },
      order: [["created_at", "DESC"]],
    });

    res.json(tests);
  } catch (err) {
    console.error("Fetch tests error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ------------------ GET SINGLE TEST ------------------
exports.getSingleTest = async (req, res) => {
  try {
    if (req.auth.role !== "company")
      return res.status(403).json({ message: "Unauthorized" });
    const testId = req.params.id;

    const test = await TestMaster.findOne({
      where: { test_id: testId, company_id: req.auth.id },
      raw: true,
    });
    if (!test) return res.status(404).json({ message: "Test not found" });

    const questions = await Question.findAll({
      where: { test_id: testId },
      order: [["order_no", "ASC"]],
      attributes: ["text"],
      raw: true,
    });

    return res.json({
      ...test,
      questions: questions.map((q) => q.text),
    });
  } catch (err) {
    console.error("getSingleTest error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// ------------------ UPDATE TEST ------------------
exports.updateTest = async (req, res) => {
  try {
    if (req.auth.role !== "company")
      return res.status(403).json({ message: "Unauthorized" });

    const testId = req.params.id;
    const { name, role, sector, description, duration, questions } = req.body;

    const test = await TestMaster.findOne({
      where: { test_id: testId, company_id: req.auth.id },
    });
    if (!test) return res.status(404).json({ message: "Test not found" });

    // update master
    await test.update({
      title: name,
      job_role: role,
      job_sector: sector,
      description,
      duration,
    });

    // replace questions (simpler approach)
    await Question.destroy({ where: { test_id: testId } });

    const cleanQuestions = (questions || []).filter(
      (q) => typeof q === "string" && q.trim() !== ""
    );
    const newRecords = cleanQuestions.map((q, idx) => ({
      test_id: testId,
      text: q.trim(),
      source_type: "admin",
      order_no: idx + 1,
    }));
    await Question.bulkCreate(newRecords);

    return res.json({ message: "✅ Test updated successfully" });
  } catch (err) {
    console.error("updateTest error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// ------------------ DELETE TEST ------------------
exports.deleteTest = async (req, res) => {
  try {
    if (req.auth.role !== "company")
      return res.status(403).json({ message: "Unauthorized" });

    const testId = req.params.id;
    const test = await TestMaster.findOne({
      where: { test_id: testId, company_id: req.auth.id },
    });
    if (!test) return res.status(404).json({ message: "Test not found" });

    await Question.destroy({ where: { test_id: testId } });
    await test.destroy();

    return res.json({ message: "🗑️ Test deleted successfully" });
  } catch (err) {
    console.error("deleteTest error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// ------------------ ASSIGN TEST ------------------
exports.assignTest = async (req, res) => {
  try {
    if (req.auth.role !== "company") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const masterTestId = req.params.id; // the test_master.test_id
    const { candidateIds } = req.body;

    if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
      return res.status(400).json({ message: "No candidates selected" });
    }

    // check that this test_master belongs to the company
    const master = await TestMaster.findOne({
      where: { test_id: masterTestId, company_id: req.auth.id },
    });
    if (!master) {
      return res
        .status(404)
        .json({ message: "Test not found for this company" });
    }

    // validate candidate IDs
    const validUsers = await User.findAll({
      where: {
        user_id: candidateIds,
        company_id: req.auth.id,
      },
    });
    if (validUsers.length !== candidateIds.length) {
      return res
        .status(400)
        .json({ message: "One or more candidates are invalid" });
    }

    // create rows
    const rows = candidateIds.map((cid) => ({
      master_test_id: masterTestId,
      user_id: cid,
      company_id: req.auth.id,
      status: "in_progress", // or "scheduled"
      created_at: new Date(),
    }));

    // bulk insert
    await Test.bulkCreate(rows);

    return res.json({ message: "✅ Test assigned successfully!" });
  } catch (err) {
    console.error("assignTest error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
