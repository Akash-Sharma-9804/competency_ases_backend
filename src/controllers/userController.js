// src/controllers/userController.js
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Company = require("../models/Company");
const Resume = require("../models/Resume");
const uploadToFTP = require("../utils/ftpUploader");

// ✅ User login
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    // Generate JWT
   const token = jwt.sign(
  { id: user.user_id, role: "user", company_id: user.company_id },
  process.env.JWT_SECRET,
  { expiresIn: "1d" }
);


    res.status(200).json({
      message: "✅ Login successful",
      token,
      user: {
        id: user.user_id,
        name: user.name,
        email: user.email,
        company_id: user.company_id
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};


// Register user (only by company)
exports.registerUserByCompany = async (req, res) => {
  try {
    // req.auth comes from JWT
    if (req.auth.role !== "company") {
      return res.status(403).json({ message: "Forbidden: Only companies can register users" });
    }

    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }
 const companyId = req.auth.id; // 👈 this is the logged-in company ID from JWT

    // check if email already exists
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      password: hashed,
      company_id: req.auth.id // company who is creating
    });

    res.status(201).json({ message: "✅ User created by company", user: { id: user.user_id, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// User self-signup
exports.registerUserSelf = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    // Check if email already exists (either user or company)
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use by a user" });
    }

    // If you also want to prevent conflicts with company emails:
    const Company = require("../models/Company");
    const existingCompany = await Company.findOne({ where: { contact_email: email } });
    if (existingCompany) {
      return res.status(400).json({ message: "Email already in use by a company" });
    }

    const hashed = await bcrypt.hash(password, 10);

    // Create user without company_id
    const newUser = await User.create({
      name,
      email,
      password: hashed,
      company_id: null, // self signup, no company
    });

    return res.status(201).json({
      message: "✅ User registered successfully",
      user: {
        id: newUser.user_id,
        name: newUser.name,
        email: newUser.email,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};



// userController.js
exports.getCandidatesByCompany = async (req, res) => {
  try {
    if (req.auth.role !== "company") {
      return res.status(403).json({ message: "Forbidden: Only companies can access this" });
    }

    const users = await User.findAll({
      where: { company_id: req.auth.id },
      attributes: { exclude: ["password"] }
    });

    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getUserProfile = async (req, res) => {
  try {
    if (req.auth.role !== "user") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const user = await User.findOne({
      where: { user_id: req.auth.id },
      attributes: ["user_id", "name", "email", "gender", "age", "bio", "photo_path", "company_id"],
      include: [
        {
          model: Company,
          attributes: ["name"],
          as: "company"
        },
        {
          model: Resume,
          attributes: ["file_path"],
          as: "resume",
          where: { resume_type: "employee" },
          required: false
        }
      ]
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    const plain = user.get({ plain: true });

    res.json({
      user_id: plain.user_id,
      name: plain.name,
      email: plain.email,
      gender: plain.gender,
      age: plain.age,
      bio: plain.bio,
      photo_path: plain.photo_path,
      company: plain.company?.name || null,           // ✅ now works
      resumeUrl: plain.resume?.file_path || null      // ✅ fix typo
    });
  } catch (err) {
    console.error("getUserProfile error:", err);
    res.status(500).json({ message: "Server error" });
  }
};



exports.updateUserProfile = async (req, res) => {
  try {
    if (req.auth.role !== "user")
      return res.status(403).json({ message: "Unauthorized" });

    const { name, email, gender, age, bio } = req.body;

    const [updated] = await User.update(
      { name, email, gender, age, bio },
      { where: { user_id: req.auth.id } }
    );

    // If nothing was updated, still return the current profile
    if (updated === 0) {
      const existingUser = await User.findOne({
        where: { user_id: req.auth.id },
        attributes: [
          "user_id", "name", "email", "gender", "age", "bio", "company_id", "photo_path"
        ],
        include: [
          {
            model: Company,
            attributes: ["name"],
            as: "company"
          }
        ]
      });

      const plain = existingUser.get({ plain: true });

      return res.json({
        ...plain,
        company: plain.company?.name || null
      }); // ✅ MUST return here to stop execution
    }

    // ✅ Fetch the updated profile
    const updatedUser = await User.findOne({
      where: { user_id: req.auth.id },
      attributes: [
        "user_id", "name", "email", "gender", "age", "bio", "company_id", "photo_path"
      ],
      include: [
        {
          model: Company,
          attributes: ["name"],
          as: "company"
        }
      ]
    });

    const plain = updatedUser.get({ plain: true });

    return res.json({
      ...plain,
      company: plain.company?.name || null
    });

  } catch (err) {
    console.error("updateUserProfile error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};



exports.uploadResume = async (req, res) => {
  try {
    const userId = req.auth.id;
    const companyId = req.auth.company_id || 0;

    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const buffer = req.file.buffer;
    const originalName = req.file.originalname;
    const mimeType = req.file.mimetype;

    // 🔁 Upload to resume-specific FTP folder
    const ftpUrl = await uploadToFTP(buffer, originalName, "resumes");

    // Optional: delete previous resume
    await Resume.destroy({ where: { user_id: userId } });

    await Resume.create({
      user_id: userId,
      company_id: companyId,
      resume_type: "employee",
      file_path: ftpUrl,
    });

    res.json({ message: "Resume uploaded", url: ftpUrl });
  } catch (err) {
    console.error("uploadResume error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// controllers/userController.js
exports.uploadPhoto = async (req, res) => {
  try {
    const userId = req.auth.id;

    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const buffer = req.file.buffer;
    const originalName = req.file.originalname;

    // 🔁 Upload to 'profile_photos' folder
    const ftpUrl = await uploadToFTP(buffer, originalName, "profile_photos");

    // ✅ Save to DB
    await User.update({ photo_path: ftpUrl }, { where: { user_id: userId } });

    res.json({ message: "Photo uploaded", url: ftpUrl });
  } catch (err) {
    console.error("uploadPhoto error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


exports.startTestNow = async (req, res) => {
  try {
    const { id: userId } = req.auth;
    const { testId } = req.params;

    const test = await Test.findOne({ where: { test_id: testId, user_id: userId } });

    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    if (test.status !== "scheduled") {
      return res.status(400).json({ message: "Test cannot be started" });
    }

    await test.update({
      status: "in_progress",
      started_at: new Date(),
    });

    return res.json({ message: "Test started" });
  } catch (err) {
    console.error("❌ Start test error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
