// src/controllers/userController.js
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");


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

