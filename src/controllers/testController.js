// controllers/testController.js
const OpenAI = require("openai"); // no destructuring
// const Test = require("../models/Test");
const Question = require("../models/Question");
const Company = require("../models/Company"); // import company model
const TestMaster = require("../models/TestMaster");
const User = require("../models/User");
const UploadedFile = require("../models/UploadedFile"); // model for uploaded_files
const Test = require("../models/Test"); // <-- your Sequelize model for `tests`
const SystemCheck = require("../models/SystemCheck"); // Your system_checks table
// ...exiting code...
const { createClient } = require("@deepgram/sdk");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// Audio cache directory
const AUDIO_CACHE_DIR = path.join(__dirname, "..", "cache", "audio");



const {
  checkFaceClarity,
  checkPose,
  compareWithGemini,
  compareWithAzure,
} = require("../utils/verifyUtils");
const uploadToFTP = require("../utils/ftpUploader");
const UserImageVerification = require("../models/UserImageVerification");

// ✅ Set up OpenAI (replace later with Gemini)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ Set up DeepSeek
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY, // store DeepSeek key in .env
  baseURL: "https://api.deepseek.com", // DeepSeek endpoint
});
// ------------------ Generate Questions ------------------

// exports.generateAIQuestions = async (req, res) => {
//   try {
//     console.log("🧠 [AI] Starting question generation...");
//     console.log("🔑 Auth info:", req.auth);

//     // ✅ Allow both company and user (if you want users to also generate questions)
//     // If you ONLY want company, leave this check:
//     if (req.auth.role !== "company" && req.auth.role !== "user") {
//       console.warn("❌ [AI] Unauthorized role:", req.auth.role);
//       return res.status(403).json({ message: "Unauthorized" });
//     }

//     const { role, sector, description, difficulty, fileIds, sourceMode } =
//       req.body;

//     console.log("📋 [AI] Incoming data:", {
//       role,
//       sector,
//       descriptionLength: description?.length,
//       difficulty,
//       fileIds,
//     });

//     if (!role || !sector || !description) {
//       console.warn("⚠️ [AI] Missing required fields");
//       return res.status(400).json({
//         message: "Role, sector, and description are required.",
//       });
//     }

//     let extraContext = "";
//     if (Array.isArray(fileIds) && fileIds.length > 0) {
//       console.log("📂 [AI] Fetching extracted text for file IDs:", fileIds);

//       const whereClause = {};
//       // if token is company, filter by company_id
//       if (req.auth.role === "company") {
//         whereClause.company_id = req.auth.company_id || req.auth.id;
//       }
//       // if token is user, filter by user_id
//       if (req.auth.role === "user") {
//         whereClause.user_id = req.auth.id;
//       }
//       whereClause.file_id = fileIds;

//       const files = await UploadedFile.findAll({ where: whereClause });

//       if (files && files.length > 0) {
//         console.log(`✅ [AI] Found ${files.length} file(s) in DB.`);
//         extraContext = files
//           .map((f) => (f.extracted_text || "").trim())
//           .filter((t) => t.length > 0)
//           .join("\n\n");
//         console.log(
//           "🧵 [AI] Combined extracted text length:",
//           extraContext.length
//         );
//       } else {
//         console.warn("⚠️ [AI] No valid files found or no text extracted.");
//       }
//     } else {
//       console.log("ℹ️ [AI] No fileIds provided, will use only job details.");
//     }

//     // ✅ Build a prompt that explicitly asks to mix both sources
//     let prompt = "";

//     if (sourceMode === "fileOnly") {
//      prompt = `
// You are an expert HR and technical interviewer.

// Generate 50 ${difficulty || "medium"}-level multiple-choice interview questions (WITHOUT answers), thoughtfully designed to probe both fundamental and practical understanding of the topic, based **ONLY** on the following reference materials.

// Avoid generic or definition-based questions unless they are critical to job success. Prioritize questions that test application, problem-solving, scenarios, and domain-specific expertise relevant to the role.

// Reference Content:
// ${extraContext}

// Return only the questions in a numbered list, with no extra commentary.
// `;

//     } else if (sourceMode === "jobOnly") {
//    prompt = `
// You are an expert HR and technical interviewer.

// Generate 50 ${difficulty || "medium"}-level, in-depth, scenario-driven interview questions (WITHOUT answers), designed to rigorously test the candidate’s expertise, analytical thinking, and practical problem-solving abilities related to the job role.

// Questions should explore complex situations, critical decision-making, troubleshooting, ethical considerations, process optimization, and applied knowledge rather than basic definitions or fact-recall unless absolutely critical for the job’s core responsibilities.

// Job Role: ${role}
// Sector: ${sector}
// Job Description: ${description}

// Return only the questions in a numbered list, with no extra commentary.
// `;

//     } else {
//       // ✅ Improved blend mode prompt – plain questions only, no HTML bias
//       prompt = `
// You are an expert HR and technical interviewer tasked with creating a competency-based test.

// Use BOTH of these information sources together:
// 1. **Job Details** – defines the target role and what the candidate should know:
//    - Job Role: ${role}
//    - Sector: ${sector}
//    - Job Description: ${description}

// 2. **Reference Content** – these uploaded materials may contain training guides, specifications, standards, or other relevant subject matter:
// ${extraContext ? `\n${extraContext}\n` : ""}

// ⚠️ Strict Instructions:
// - Prioritize generating advanced questions that test a candidate’s ability to handle real-world problems, technical challenges, cross-functional collaboration, and critical thinking in the context of the job role, sector, and description.
// - Use reference content to enrich the questions with industry best practices, compliance standards, frameworks, methodologies, and domain-specific nuances **only when they directly support the job requirements**.
// - Avoid including multiple-choice formats; questions should be open-ended, thought-provoking, and designed to assess deep understanding, reasoning, and problem-solving capabilities.
// - Do not mention “files,” “reference materials,” authors, or personal information in the questions.
// - Ensure that each question is complex, clear, and structured to test the candidate’s ability to analyze, synthesize, and apply knowledge in practical scenarios.
// - Steer clear of generic or definition-based questions unless they are essential to the role’s functions or critical safety or compliance requirements.
// - Craft questions that explore cross-domain challenges, troubleshooting steps, process improvements, risk management, and ethical considerations.
// - When files are not provided, focus entirely on the job sector, role, and description to create nuanced questions that simulate real tasks, responsibilities, and challenges the candidate may face.


// 🎯 Goal:
// Produce 50 expert-level, scenario-based, and application-focused interview questions (plain questions only, no answer options), designed to thoroughly assess both deep technical expertise and complex problem-solving abilities.

// - Questions should challenge candidates to think critically, make informed decisions, and solve problems they would realistically face in the job role and sector.
// - Include questions that explore troubleshooting, risk assessment, ethical dilemmas, process optimization, and strategic planning.
// - Avoid surface-level or definition-based questions unless they are essential for compliance, safety, or foundational understanding.
// - Use job details and sector information to craft nuanced, high-stakes scenarios that require thoughtful analysis and applied knowledge.
// - Frame each question as a standalone, testable prompt without requiring additional explanation or context.
// - When reference files are missing, ensure that questions are still comprehensive, leveraging the job role, sector, and description to simulate practical challenges, industry-specific problems, and role-related decision-making.

// Return only the questions in a numbered list, with no extra commentary and no answer choices.

// `;
//     }

//     console.log("📝 [AI] Prompt ready, length:", prompt.length);

//       // ✅ Call DeepSeek instead of GPT
//     const completion = await deepseek.chat.completions.create({
//       model: "deepseek-chat", // DeepSeek chat model
//       messages: [
//         { role: "system", content: "You are an expert HR and interviewer." },
//         { role: "user", content: prompt },
//       ],
//       temperature: 0.7,
//       max_tokens: 8000, // DeepSeek supports much larger token windows
//     });

//     const raw = completion.choices[0].message.content;
//     console.log("✅ [AI] Response received, length:", raw.length);

//     const questions = raw
//       .split("\n")
//       .map((line) => line.trim())
//       .filter((line) => line.length > 0)
//       .map((line) => line.replace(/^\d+[\.\)]\s*/, "").trim());

//     console.log("✅ [AI] Final question count:", questions.length);
//     return res.json({ questions });
//   } catch (err) {
//     console.error("❌ [AI] Error:", err);
//     return res
//       .status(500)
//       .json({ message: "AI generation failed", error: err.message });
//   }
// };

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

    const { role, sector,   difficulty, fileIds, sourceMode } =
      req.body;

    console.log("📋 [AI] Incoming data:", {
      role,
      sector,
      
      difficulty,
      fileIds,
    });

    if (!role || !sector ) {
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

Generate 50 ${difficulty || "medium"}-level multiple-choice interview questions (WITHOUT answers), thoughtfully designed to probe both fundamental and practical understanding of the topic, based **ONLY** on the following reference materials.

Avoid generic or definition-based questions unless they are critical to job success. Prioritize questions that test application, problem-solving, scenarios, and domain-specific expertise relevant to the role.

Reference Content:
${extraContext}

Return only the questions in a numbered list, with no extra commentary.
`;

    } else if (sourceMode === "jobOnly") {
  prompt = `
You are an expert adaptive interviewer conducting a conversational assessment for a candidate.

The candidate is applying for the job:
- Job Title: ${role}
- Sector: ${sector}

Given the conversational nature of this assessment, questions will be dynamically generated and adapted as the candidate responds. However, the underlying distribution of knowledge areas remains:

Knowledge Type      Percentage      Focus Areas
Theoretical         40%            Definitions, principles, foundational concepts.
Practical           35%            Step-by-step processes, tool usage, implementation.
Real-World Application 25%         Scenario-based problem-solving, case studies, ethical considerations.

For a one-hour assessment:
- Total conversational turns: approximately 15–20 exchanges (AI question → candidate response → follow-up).
- Core questions: 5–7 main questions, each with potential follow-ups.
- Theoretical: 2–3 main questions.
- Practical: 2 main questions.
- Real-world: 1–2 scenario-based questions.

Generate at least 25 diverse, open-ended, and **challenging** questions that test the candidate’s:
- Theoretical knowledge (in-depth principles, complex definitions, and critical reasoning).
- Practical skills (multi-step processes, advanced tool usage, and implementation challenges).
- Real-world problem-solving (high-stakes case studies, intricate troubleshooting, and nuanced ethical considerations).

Design questions that are thought-provoking, rigorous, and tailored to assess the candidate’s problem-solving, analytical thinking, and applied expertise under realistic constraints. Avoid repetition and simplistic questions unless foundational knowledge is essential. Prioritize questions that stretch understanding and test judgment, decision-making, and adaptability in complex scenarios.

Return the questions in a numbered list format, with no explanations or answers.


`;


    } else {
      // ✅ Improved blend mode prompt – plain questions only, no HTML bias
     prompt = `
You are an expert adaptive interviewer facilitating a conversational assessment tailored to the candidate’s progress.

The candidate is applying for the job:
- Job Title: ${role}
- Sector: ${sector}

This conversational assessment aims to evaluate their understanding through dynamically generated questions. The knowledge areas are distributed as follows:

Knowledge Type      Percentage      Focus Areas
Theoretical         40%            Definitions, principles, foundational concepts.
Practical           35%            Step-by-step processes, tool usage, implementation.
Real-World Application 25%         Scenario-based problem-solving, case studies, ethical considerations.

For a one-hour conversational session:
- Expect ~15–20 exchanges including follow-ups and clarifications.
- Core questions: 5–7 main ones.
- Theoretical: 2–3.
- Practical: 2.
- Real-world: 1–2.

Generate at least 25 advanced, scenario-driven, and **difficult** questions that test the candidate’s:
- Theoretical understanding (complex definitions, intricate principles, and critical thinking).
- Practical skills (multi-layered processes, sophisticated toolsets, and real implementation hurdles).
- Real-world application (high-pressure case studies, advanced troubleshooting, and deep ethical dilemmas).

Craft questions that challenge the candidate’s ability to analyze, reason, and make informed decisions in difficult, uncertain, or high-stakes situations. Avoid simple or repetitive questions unless absolutely necessary for foundational understanding. Emphasize problems that demand creativity, resilience, and advanced problem-solving skills aligned with the demands of the job role and sector.

Return the questions in a numbered list format, with no explanations or answer choices.


`;

    }

    console.log("📝 [AI] Prompt ready, length:", prompt.length);

      // ✅ Call DeepSeek instead of GPT
    const completion = await deepseek.chat.completions.create({
      model: "deepseek-chat", // DeepSeek chat model
      messages: [
        { role: "system", content: "You are an expert HR and interviewer." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 8000, // DeepSeek supports much larger token windows
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

exports.createTest = async (req, res) => {
  try {
    const { role, id: authId } = req.auth;

    if (role !== "company" && role !== "user") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const {
      name,
      role: jobRole,
      sector,
      description,
      duration,
      questions,
    } = req.body;

    if (
      !name ||
      !jobRole ||
      !sector ||
      !duration ||
      !Array.isArray(questions)
    ) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    // ✅ Clean and validate questions
    const cleanQuestions = questions.filter(
      (q) => typeof q === "string" && q.trim() !== ""
    );
    if (cleanQuestions.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one valid question is required." });
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
        started_at: req.body.startInstantly
          ? new Date()
          : req.body.scheduled_start || null,
        ended_at: req.body.scheduled_end || null,
      });
    }

    return res.status(201).json({
      message: `✅ ${
        role === "user" ? "Mock test" : "Company test"
      } created successfully!`,
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
    //  if (role !== "company" && role !== "user") {
    //   return res.status(403).json({ message: "Unauthorized" });
    // }
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
    
    const { startDateTime, endDateTime, timezone } = req.body;
    const testId = req.params.id;
    
    if (!startDateTime || !endDateTime || !timezone) {
      return res.status(400).json({ 
        message: "Start time, end time, and timezone are required" 
      });
    }

    // Convert to UTC for storage
    const moment = require('moment-timezone');
    const startUTC = moment.tz(startDateTime, timezone).utc().toDate();
    const endUTC = moment.tz(endDateTime, timezone).utc().toDate();

    // Validate that end time is after start time
    if (endUTC <= startUTC) {
      return res.status(400).json({ 
        message: "End time must be after start time" 
      });
    }

    const updated = await TestMaster.update(
      { 
        scheduled_start: startUTC, 
        scheduled_end: endUTC,
        timezone: timezone // Store timezone for reference
      },
      { where: { test_id: testId, company_id: req.auth.id } }
    );

    if (updated[0] === 0) {
      return res.status(404).json({ 
        message: "Test not found or not owned by you" 
      });
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

exports.systemCheck = async (req, res) => {
  console.log("System check auth info:", req.auth);
  console.log("System check params:", req.params);
  const userId = req.auth.id; // token verified
  const testId = req.params.id;

  try {
    const [rows] = await db.query(
      `SELECT * FROM system_checks WHERE user_id = ? AND test_id = ?`,
      [userId, testId]
    );

    if (
      !rows.length ||
      !rows[0].camera ||
      !rows[0].microphone ||
      !rows[0].speaker
    ) {
      return res.status(403).json({
        success: false,
        message:
          "System check not completed. Please check camera, mic, and speaker.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "System check completed. Access granted.",
    });
  } catch (err) {
    console.error("System check error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error during system check validation.",
    });
  }
};

// ✅ START TEST
exports.startTest = async (req, res) => {
  try {
    console.log("Start test request body:", req.body);
    console.log("Start test auth info:", req.auth);
    const { test_id } = req.body;
    const user_id = req.auth.id;

    // Check if test exists and is assigned to this user
    const test = await Test.findOne({
      where: {
        test_id,
        user_id,
        is_deleted: false,
      },
      include: [{ model: TestMaster, as: "test_master" }], // ✅ FIXED HERE
    });

    if (!test) {
      return res
        .status(403)
        .json({ message: "Unauthorized or test not assigned" });
    }

    const now = new Date();
    const scheduledStart = new Date(test.test_master.scheduled_start);
    const scheduledEnd = new Date(test.test_master.scheduled_end);

    if (now < scheduledStart || now > scheduledEnd) {
      return res.status(403).json({ message: "Test is not currently active" });
    }

    return res.status(200).json({
      message: "Test access granted",
      test_id,
      user_id,
      test_title: test.test_master.title,
      instructions: test.test_master.instructions,
    });
  } catch (err) {
    console.error("Start Test Error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.performSystemCheck = async (req, res) => {
  try {
    console.log("Perform system check request body:", req.body);
    console.log("Perform system check auth info:", req.auth);
    const { test_id, camera, microphone, speaker, network_speed } = req.body;
    const user_id = req.auth.id;

    if (!test_id) {
      return res.status(400).json({ message: "Test ID is required" });
    }

    // Validate user is assigned this test
    const test = await Test.findOne({
      where: { test_id, user_id },
    });

    if (!test) {
      return res
        .status(403)
        .json({ message: "User not assigned to this test" });
    }

    // Validate system checks
    const issues = [];
    if (!camera) issues.push("Camera");
    if (!microphone) issues.push("Microphone");
    if (!speaker) issues.push("Speaker");

    if (issues.length > 0) {
      return res.status(400).json({
        message: `System check failed: ${issues.join(", ")} not working`,
      });
    }

    // Store or update the system check
    const [check, created] = await SystemCheck.findOrCreate({
      where: { test_id, user_id },
      defaults: {
        camera,
        microphone,
        speaker,
        network_speed,
      },
    });

    if (!created) {
      // Already exists → update
      await check.update({ camera, microphone, speaker, network_speed });
    }

    return res.status(200).json({ message: "System check successful" });
  } catch (err) {
    console.error("System Check Error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.uploadImageVerificationPhoto = async (req, res) => {
  try {
    const userId = req.auth.id;
    const { position, test_id } = req.body;

    if (!test_id) return res.status(400).json({ message: "Missing test ID" });
    if (!["front", "left", "right"].includes(position))
      return res.status(400).json({ message: "Invalid face position" });

    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const buffer = req.file.buffer;
    const originalName = req.file.originalname;

    const ftpUrl = await uploadToFTP(
      buffer,
      originalName,
      "image_verification"
    );
    if (!ftpUrl) {
      console.error("FTP upload did not return a valid URL");
      return res.status(500).json({ message: "FTP upload failed" });
    }

    console.log("Saving image verification with path:", ftpUrl);

    // Check if verification record already exists
    let record = await UserImageVerification.findOne({
      where: { user_id: userId, test_id },
    });

    // Build image path field
    const updateData = {
      [`${position}_image_path`]: ftpUrl,
    };

    if (record) {
      // Update existing record
      await record.update(updateData);
    } else {
      // Create new record
      await UserImageVerification.create({
        user_id: userId,
        test_id,
        ...updateData,
        is_verified: false,
      });
    }

    res.json({ message: "Image uploaded", url: ftpUrl });
  } catch (err) {
    console.error("Image upload error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.verifyImage = async (req, res) => {
  try {
    const userId = req.auth.id;
    const { test_id } = req.body;

    console.log("[Verify] Verifying user ID:", userId);
    console.log("[Verify] Received test_id:", test_id);

    const profile = await User.findByPk(userId);
    console.log("[Verify] Profile photo_path:", profile?.photo_path);

    if (!profile?.photo_path) {
      return res.status(400).json({ message: "No profile photo found" });
    }

    if (!test_id) return res.status(400).json({ message: "Missing test ID" });

    const record = await UserImageVerification.findOne({
      where: { user_id: userId, test_id },
    });

    if (!record)
      return res
        .status(400)
        .json({ message: "No image verification record found" });

    console.log("[Verify] Uploaded images:", {
      front: record.front_image_path,
      left: record.left_image_path,
      right: record.right_image_path,
    });

    const missing = [];
    if (!record.front_image_path) missing.push("front");
    if (!record.left_image_path) missing.push("left");
    if (!record.right_image_path) missing.push("right");

    if (missing.length) {
      return res
        .status(400)
        .json({ message: `Missing images: ${missing.join(", ")}` });
    }

    console.log("[Verify] Running Gemini verification for all poses...");
    const results = await Promise.all([
      verifySingleImage(profile.photo_path, record.front_image_path, "front"),
      verifySingleImage(profile.photo_path, record.left_image_path, "left"),
      verifySingleImage(profile.photo_path, record.right_image_path, "right"),
    ]);

    const allPassed = results.every((r) => r.passed);
    await record.update({ is_verified: allPassed });

    console.log("[Verify] Verification results:", results);
    res.json({ message: "Verification completed", results });
  } catch (err) {
    console.error("Image verification error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

async function verifySingleImage(profilePath, candidatePath, pose) {
  if (!candidatePath) return { pose, passed: false, error: "Missing image" };

  console.log(`[Verify] Verifying pose: ${pose}`);
  const isSamePerson = await compareWithAzure(profilePath, candidatePath);
  console.log(`[Verify] Pose: ${pose} → Match: ${isSamePerson}`);
  return { pose, candidatePath, passed: isSamePerson, isSamePerson };
}


// ------------------ GET TEST DATA FOR STARTED TEST ------------------
exports.getStartedTestData = async (req, res) => {
  try {
    const { id } = req.params;

    // Step 1: Get test instance (from tests table)
    const test = await Test.findByPk(id);
    if (!test) return res.status(404).json({ message: "Test not found" });

    const test_master_id = test.master_test_id;

    // Step 2: Get title from test_master
    const testMaster = await TestMaster.findByPk(test.master_test_id);
    if (!testMaster)
      return res.status(404).json({ message: "Test master not found" });

    // Step 3: Fetch all questions for this test instance (test_id in questions table)
    const questions = await Question.findAll({
      where: { test_id: test_master_id },
      // order: [['question_id', 'ASC']],
    });

    // Step 4: Send back combined data
    res.json({
      test_id: test.test_id,
      title: testMaster.title, // ✅ from test_master table
      total_questions: questions.length,
      questions,
    });
  } catch (err) {
    console.error("❌ getStartedTestData error:", err);
    res.status(500).json({ error: "Failed to load test data" });
  }
};

// Helper function to generate cache key from text
const generateCacheKey = (text) => {
  return crypto.createHash("md5").update(text).digest("hex");
};

// Ensure cache directory exists
const ensureCacheDir = () => {
  if (!fs.existsSync(AUDIO_CACHE_DIR)) {
    fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
  }
};

// Deepgram TTS for reading out a question with caching
exports.getQuestionAudio = async (req, res) => {
  try {
    console.log(`🔊 [TTS] Audio request - Test: ${req.params.id}, Question: ${req.params.questionNo}`);
    
    const { id, questionNo } = req.params;
    const test = await Test.findByPk(id);
    // console.log(`📋 [TTS] Test found:`, test ? 'YES' : 'NO');
    if (!test) return res.status(404).json({ message: "Test not found" });

    const testMaster = await TestMaster.findByPk(test.master_test_id);
    // console.log(`📄 [TTS] Test master found:`, testMaster ? 'YES' : 'NO');
    if (!testMaster)
      return res.status(404).json({ message: "Test master not found" });

    const questions = await Question.findAll({
      where: { test_id: testMaster.test_id },
      order: [["order_no", "ASC"]],
      raw: true,
    });
    // console.log(`❓ [TTS] Questions found: ${questions.length}`);

    const idx = parseInt(questionNo, 10) - 1;
    // console.log(`🔢 [TTS] Question index: ${idx} (from questionNo: ${questionNo})`);
    if (idx < 0 || idx >= questions.length) {
      console.log(`❌ [TTS] Invalid question index: ${idx}, total questions: ${questions.length}`);
      return res.status(400).json({ message: "Invalid question number" });
    }

    const text = questions[idx].text;
    // console.log(`📝 [TTS] Question text: ${text.substring(0, 100)}...`);
    
    const cacheKey = generateCacheKey(text);
    const cachePath = path.join(AUDIO_CACHE_DIR, `${cacheKey}.wav`);
    // console.log(`🔑 [TTS] Cache key: ${cacheKey}`);

    // Check if audio is already cached
    if (fs.existsSync(cachePath)) {
      // console.log(`✅ [TTS] Serving cached audio for question ${questionNo}`);
      const audioBuffer = fs.readFileSync(cachePath);
      res.set("Content-Type", "audio/wav");
      return res.send(audioBuffer);
    }

    console.log(`🎯 [TTS] Generating new audio for question ${questionNo}`);
    console.log(`🌐 [TTS] Calling Deepgram API...`);

    // Generate audio with Deepgram TTS API v3
    let audioBuffer;
    try {
      const response = await deepgram.speak.request(
        { text },
        {
          model: "aura-2-saturn-en",
          encoding: "linear16",
          sample_rate: 24000,
          container: "wav",
        }
      );

      console.log(`📦 [TTS] Received response from Deepgram`);
      console.log(`🔍 [TTS] Response type:`, typeof response);
      console.log(`🔍 [TTS] Response keys:`, Object.keys(response || {}));
      
      // The Deepgram SDK returns a Response object with a 'result' property
      if (response && response.result) {
        console.log(`🔍 [TTS] Found result property, type:`, typeof response.result);
        
        // The result is likely a fetch Response object
        if (response.result && typeof response.result.arrayBuffer === 'function') {
          console.log(`🔍 [TTS] Result has arrayBuffer method`);
          const arrayBuffer = await response.result.arrayBuffer();
          audioBuffer = Buffer.from(arrayBuffer);
        } else if (response.result && typeof response.result.blob === 'function') {
          console.log(`🔍 [TTS] Result has blob method`);
          const blob = await response.result.blob();
          const arrayBuffer = await blob.arrayBuffer();
          audioBuffer = Buffer.from(arrayBuffer);
        } else if (Buffer.isBuffer(response.result)) {
          console.log(`🔍 [TTS] Result is already a Buffer`);
          audioBuffer = response.result;
        } else {
          console.log(`🔍 [TTS] Attempting direct buffer conversion of result`);
          audioBuffer = Buffer.from(response.result);
        }
      } else if (response && response.stream) {
        console.log(`🔍 [TTS] Found stream property`);
        const chunks = [];
        response.stream.on('data', chunk => chunks.push(chunk));
        await new Promise((resolve, reject) => {
          response.stream.on('end', resolve);
          response.stream.on('error', reject);
        });
        audioBuffer = Buffer.concat(chunks);
      } else if (response && typeof response.arrayBuffer === 'function') {
        console.log(`🔍 [TTS] Response has arrayBuffer method`);
        audioBuffer = Buffer.from(await response.arrayBuffer());
      } else if (Buffer.isBuffer(response)) {
        console.log(`🔍 [TTS] Response is already a Buffer`);
        audioBuffer = response;
      } else {
        console.log(`🔍 [TTS] Attempting direct buffer conversion`);
        audioBuffer = Buffer.from(response);
      }
      
      console.log(`📊 [TTS] Audio buffer size: ${audioBuffer.length} bytes`);
      
      if (!audioBuffer || audioBuffer.length === 0) {
        throw new Error('Received empty audio buffer from Deepgram');
      }
      
    } catch (deepgramError) {
      console.error(`❌ [TTS] Deepgram API error:`, deepgramError);
      throw deepgramError;
    }

    // Cache the audio
    ensureCacheDir();
    fs.writeFileSync(cachePath, audioBuffer);
    console.log(`💾 [TTS] Audio cached for question ${questionNo} at: ${cachePath}`);

    res.set("Content-Type", "audio/wav");
    res.send(audioBuffer);
    console.log(`📤 [TTS] Audio sent to client`);
  } catch (err) {
    console.error("❌ [TTS] Deepgram TTS error:", err);
    res.status(500).json({ message: "TTS failed: " + err.message });
  }
};



