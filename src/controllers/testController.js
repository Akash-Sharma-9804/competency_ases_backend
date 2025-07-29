// controllers/testController.js
const OpenAI = require("openai"); // no destructuring
// const Test = require("../models/Test");
const Question = require("../models/Question");
const Company = require("../models/Company"); // import company model
const TestMaster = require("../models/TestMaster");
const User = require("../models/User");
const UploadedFile = require("../models/UploadedFile"); // model for uploaded_files
const Test = require("../models/Test"); // <-- your Sequelize model for `tests`
// ✅ Set up OpenAI (replace later with Gemini)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ------------------ Generate Questions ------------------
 

exports.generateAIQuestions = async (req, res) => {
  try {
    console.log("🧠 [AI] Starting question generation...");
    console.log("🔑 Auth info:", req.auth);

    // ✅ Allow both company and user (if you want users to also generate questions)
    // If you ONLY want company, leave this check:
    if (req.auth.role !== "company" && req.auth.role !== "user") {
      console.warn("❌ [AI] Unauthorized role:", req.auth.role);
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { role, sector, description, difficulty, fileIds, sourceMode } =
      req.body;

    console.log("📋 [AI] Incoming data:", {
      role,
      sector,
      descriptionLength: description?.length,
      difficulty,
      fileIds,
    });

    if (!role || !sector || !description) {
      console.warn("⚠️ [AI] Missing required fields");
      return res.status(400).json({
        message: "Role, sector, and description are required.",
      });
    }

    let extraContext = "";
    if (Array.isArray(fileIds) && fileIds.length > 0) {
      console.log("📂 [AI] Fetching extracted text for file IDs:", fileIds);

      const whereClause = {};
      // if token is company, filter by company_id
      if (req.auth.role === "company") {
        whereClause.company_id = req.auth.company_id || req.auth.id;
      }
      // if token is user, filter by user_id
      if (req.auth.role === "user") {
        whereClause.user_id = req.auth.id;
      }
      whereClause.file_id = fileIds;

      const files = await UploadedFile.findAll({ where: whereClause });

      if (files && files.length > 0) {
        console.log(`✅ [AI] Found ${files.length} file(s) in DB.`);
        extraContext = files
          .map((f) => (f.extracted_text || "").trim())
          .filter((t) => t.length > 0)
          .join("\n\n");
        console.log(
          "🧵 [AI] Combined extracted text length:",
          extraContext.length
        );
      } else {
        console.warn("⚠️ [AI] No valid files found or no text extracted.");
      }
    } else {
      console.log("ℹ️ [AI] No fileIds provided, will use only job details.");
    }

    // ✅ Build a prompt that explicitly asks to mix both sources
    let prompt = "";

    if (sourceMode === "fileOnly") {
      prompt = `
You are an expert HR and technical interviewer.

Generate 50 ${
        difficulty || "medium"
      }-level multiple-choice interview questions (WITHOUT answers) based **ONLY** on the following reference materials.
Ignore job role and description.

⚠️ Do not mention "reference material" in the questions. Just ask clear, specific, directly testable questions.

Reference Content:
${extraContext}

Return only the questions in a numbered list, with no extra commentary.
`;
    } else if (sourceMode === "jobOnly") {
      prompt = `
You are an expert HR and technical interviewer.

Generate 50 ${
        difficulty || "medium"
      }-level multiple-choice interview questions (WITHOUT answers) based on the following job details:

Job Role: ${role}
Sector: ${sector}
Job Description: ${description}

Do not use any reference materials, focus only on the job details.

Return only the questions in a numbered list, with no extra commentary.
`;
    } else {
      // ✅ Improved blend mode prompt – plain questions only, no HTML bias
      prompt = `
You are an expert HR and technical interviewer tasked with creating a competency-based test.

Use BOTH of these information sources together:
1. **Job Details** – defines the target role and what the candidate should know:
   - Job Role: ${role}
   - Sector: ${sector}
   - Job Description: ${description}

2. **Reference Content** – these uploaded materials may contain training guides, specifications, standards, or other relevant subject matter:
${extraContext ? `\n${extraContext}\n` : ""}

⚠️ Strict Instructions:
- Focus primarily on the skills, technologies, and knowledge required for the job role and description.
- Use the reference content to add depth and detail (frameworks, processes, compliance points, technical details) **only if they are relevant to the job**.
- **Do NOT include answer choices or multiple‑choice options.**
- **Do NOT mention “files,” “reference materials,” authors, or personal info.**
- Each question must be clear, specific, and directly testable as a standalone question.
- Avoid overly generic questions that test only basic definitions, unless they are critical to the job role.
- Cover a balanced mix of topics from both the job description and the reference content.

🎯 Goal:
Produce 50 well‑formed, professional‑level interview questions (plain questions only, no answer options).

Return only the questions in a numbered list, with no extra commentary and no answer choices.
`;
    }

    console.log("📝 [AI] Prompt ready, length:", prompt.length);

    // ✅ Call OpenAI
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
    console.log("✅ [AI] Response received, length:", raw.length);

    const questions = raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.replace(/^\d+[\.\)]\s*/, "").trim());

    console.log("✅ [AI] Final question count:", questions.length);
    return res.json({ questions });
  } catch (err) {
    console.error("❌ [AI] Error:", err);
    return res
      .status(500)
      .json({ message: "AI generation failed", error: err.message });
  }
};

// ------------------ Create Test ------------------
// exports.createTest = async (req, res) => {
//   try {
//     if (req.auth.role !== "company") {
//       return res.status(403).json({ message: "Unauthorized" });
//     }

//     const { name, role, sector, description, duration, questions } = req.body;

//     // validate
//     if (!name || !role || !sector || !duration || !Array.isArray(questions)) {
//       return res.status(400).json({ message: "Missing required fields." });
//     }

//     // filter and clean questions
//     const cleanQuestions = questions.filter(
//       (q) => typeof q === "string" && q.trim() !== ""
//     );

//     if (cleanQuestions.length === 0) {
//       return res
//         .status(400)
//         .json({ message: "At least one valid question is required." });
//     }

//     // create test in test_master
//     const test = await TestMaster.create({
//       title: name,
//       job_role: role,
//       job_sector: sector,
//       description: description || null,
//       duration,
//       status: "active",
//       company_id: req.auth.id,
//     });

//     // prepare records with text & source_type
//     const questionRecords = cleanQuestions.map((q, idx) => ({
//       test_id: test.test_id,
//       text: q.trim(),
//       source_type: "admin",
//       order_no: idx + 1,
//     }));

//     console.log("✅ questionRecords preview:", questionRecords[0]);

//     await Question.bulkCreate(questionRecords);

//     return res.status(201).json({
//       message: "✅ Test created successfully!",
//       test_id: test.test_id,
//     });
//   } catch (err) {
//     console.error("❌ Create test error:", err);
//     return res.status(500).json({ message: "Server error" });
//   }
// };

exports.createTest = async (req, res) => {
  try {
    const { role, id: authId } = req.auth;

    if (role !== "company" && role !== "user") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { name, role: jobRole, sector, description, duration, questions } = req.body;

    if (!name || !jobRole || !sector || !duration || !Array.isArray(questions)) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    // ✅ Clean and validate questions
    const cleanQuestions = questions.filter(q => typeof q === "string" && q.trim() !== "");
    if (cleanQuestions.length === 0) {
      return res.status(400).json({ message: "At least one valid question is required." });
    }

    // ✅ Prepare test data
    const testData = {
      title: name,
      job_role: jobRole,
      job_sector: sector,
      description: description || null,
      duration,
      status: "active",
      scheduled_start: null,
      scheduled_end: null,
      is_deleted: false,
      deleted_at: null,
    };

    // ✅ Assign company_id or user_id
    if (role === "company") {
      testData.company_id = authId;
    } else if (role === "user") {
      testData.user_id = authId;
    }

    // ✅ Create master test
    const test = await TestMaster.create(testData);

    // ✅ Create questions
    const questionRecords = cleanQuestions.map((q, idx) => ({
      test_id: test.test_id,
      text: q.trim(),
      source_type: role === "user" ? "user" : "admin",
      order_no: idx + 1,
    }));

    await Question.bulkCreate(questionRecords);

    // ✅ Auto-assign test to user (mock test)
   if (role === "user") {
 await Test.create({
  master_test_id: test.test_id,
  user_id: authId,
  status: req.body.startInstantly ? "in_progress" : "scheduled",
  started_at: req.body.startInstantly ? new Date() : req.body.scheduled_start || null,
  ended_at: req.body.scheduled_end || null,
});
}


    return res.status(201).json({
      message: `✅ ${role === "user" ? "Mock test" : "Company test"} created successfully!`,
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
    if (req.auth.role !== "company") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const testId = req.params.id;

    // Find the test master
    const test = await TestMaster.findOne({
      where: { test_id: testId, company_id: req.auth.id, is_deleted: false },
    });
    if (!test) return res.status(404).json({ message: "Test not found" });

    // Soft delete the master
    await TestMaster.update(
      { is_deleted: true, deleted_at: new Date() },
      { where: { test_id: testId } }
    );

    // Soft delete all assigned tests linked to it
    await Test.update(
      { is_deleted: true, deleted_at: new Date() },
      { where: { master_test_id: testId } }
    );

    return res.json({ message: "🗑️ Test soft-deleted successfully" });
  } catch (err) {
    console.error("deleteTest error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// ------------------ ASSIGN TEST ------------------

// POST /tests/:id/assign
exports.assignTest = async (req, res) => {
  try {
    if (req.auth.role !== "company") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const masterTestId = req.params.id;
    const { candidateIds } = req.body;

    if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
      return res.status(400).json({ message: "No candidates selected" });
    }

    // get master test with schedule
    const master = await TestMaster.findOne({
      where: { test_id: masterTestId, company_id: req.auth.id },
    });

    if (!master) {
      return res
        .status(404)
        .json({ message: "Test not found for this company" });
    }

    if (!master.scheduled_start || !master.scheduled_end) {
      return res
        .status(400)
        .json({ message: "Set a schedule before assigning" });
    }

    // validate users
    const validUsers = await User.findAll({
      where: { user_id: candidateIds, company_id: req.auth.id },
    });
    if (validUsers.length !== candidateIds.length) {
      return res.status(400).json({ message: "Invalid candidates selected" });
    }

    const rows = candidateIds.map((cid) => ({
      master_test_id: masterTestId,
      user_id: cid,
      company_id: req.auth.id,
      started_at: master.scheduled_start,
      ended_at: master.scheduled_end,
      status: "scheduled",
      created_at: new Date(),
    }));

    await Test.bulkCreate(rows);
    return res.json({
      message: "✅ Test assigned successfully with schedule!",
    });
  } catch (err) {
    console.error("assignTest error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// PUT /tests/:id/schedule
exports.updateTestSchedule = async (req, res) => {
  try {
    if (req.auth.role !== "company") {
      return res.status(403).json({ message: "Unauthorized" });
    }
    const { startDateTime, endDateTime } = req.body;
    const testId = req.params.id;

    if (!startDateTime || !endDateTime) {
      return res
        .status(400)
        .json({ message: "Start and End time are required" });
    }

    const updated = await TestMaster.update(
      { scheduled_start: startDateTime, scheduled_end: endDateTime },
      { where: { test_id: testId, company_id: req.auth.id } }
    );

    if (updated[0] === 0) {
      return res
        .status(404)
        .json({ message: "Test not found or not owned by you" });
    }

    return res.json({ message: "✅ Schedule updated successfully!" });
  } catch (err) {
    console.error("updateTestSchedule error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getAssignedTests = async (req, res) => {
  try {
    if (req.auth.role !== "company") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const companyId = req.auth.id;

    const assignments = await Test.findAll({
      where: {
        company_id: companyId,
        is_deleted: false, // ✅ filter
        status: ["scheduled", "in_progress", "passed", "failed"],
      },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["user_id", "name", "email"],
          required: true,
        },
        {
          model: TestMaster,
          as: "test_master",
          attributes: ["test_id", "title", "scheduled_start", "scheduled_end"],
          required: true,
          where: { is_deleted: false }, // ✅ filter out deleted master tests
        },
      ],
      order: [["created_at", "DESC"]],
    });

    res.json(assignments);
  } catch (err) {
    console.error("getAssignedTests error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ GET /api/tests/user-assigned
exports.getUserAssignedTests = async (req, res) => {
  try {
    if (req.auth.role !== "user") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const userId = req.auth.id;

    const tests = await Test.findAll({
      where: {
        user_id: userId,
        is_deleted: false, // ✅ filter
      },
      include: [
        {
          model: TestMaster,
          as: "test_master",
          attributes: [
            "test_id",
            "title",
            "scheduled_start",
            "scheduled_end",
            "duration",
          ],
          where: { is_deleted: false }, // ✅ filter out deleted master tests
        },
        {
          model: Company,
          as: "company",
          attributes: ["company_id", "name"],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    res.json(tests);
  } catch (err) {
    console.error("getUserAssignedTests error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
