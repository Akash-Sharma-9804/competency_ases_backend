const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Company = require("../models/Company");
// ✅ Add this import at the top of companyController.js
const  User  = require("../models/User");
const TestMaster = require("../models/TestMaster");
const Test = require("../models/Test");
 

// Register company
exports.registerCompany = async (req, res) => {
  try {
    const { name, contact_email, password, sector_id, address } = req.body;

    const existing = await Company.findOne({ where: { name } });
    if (existing) return res.status(400).json({ message: "Company already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const company = await Company.create({ name, contact_email, password: hashed, sector_id, address });

    res.status(201).json({ message: "✅ Company registered", company });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Login company
// In loginCompany controller
exports.loginCompany = async (req, res) => {
  try {
    const { contact_email, password } = req.body;
    if (!contact_email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const company = await Company.findOne({ where: { contact_email } });
    if (!company) return res.status(404).json({ message: "Company not found" });

    const match = await bcrypt.compare(password, company.password);
    if (!match) return res.status(400).json({ message: "Invalid credentials" });

   const token = jwt.sign(
  { id: company.company_id, role: "company", company_id: company.company_id },
  process.env.JWT_SECRET,
  { expiresIn: "1d" }
);


    res.json({ message: "✅ Company login successful", token, company });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getCompanyStats = async (req, res) => {
  try {
    if (req.auth.role !== "company") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const companyId = req.auth.id;

    // ✅ Count total tests created in test_master
    const totalTests = await TestMaster.count({
      where: { company_id: companyId },
    });

    // ✅ Count total candidates (depends on your schema, adjust if needed)
    const totalCandidates = await User.count({
      where: { company_id: companyId },
    });

    // ✅ Count completed tests from tests table (user attempts)
    // Assuming tests table has status column: in_progress, passed, failed, under_review
    // Completed means: passed OR failed
    const completedTests = await Test.count({
      where: {
        company_id: companyId,
        status: ["passed", "failed"],
      },
    });

    // (Optional) Upcoming tests if you use a status like 'scheduled'
    // const upcomingTests = await TestMaster.count({ where: { company_id: companyId, status: 'scheduled' } });

    res.json({
      totalTests,
      totalCandidates,
      completedTests,
      // upcomingTests // add later if needed
    });
  } catch (err) {
    console.error("❌ getCompanyStats error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getCompanyProfile = async (req, res) => {
  try {
    if (req.auth.role !== "company") {
      return res.status(403).json({ message: "Unauthorized" });
    }
    const companyId = req.auth.id;
    const company = await Company.findByPk(companyId, {
      attributes: ["company_id", "name", "contact_email", "address", "about", "website_url", "logo_url", "created_at"]
    });
    if (!company) return res.status(404).json({ message: "Company not found" });
    res.json(company);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateCompanyProfile = async (req, res) => {
  try {
    if (req.auth.role !== "company") {
      return res.status(403).json({ message: "Unauthorized" });
    }
    const companyId = req.auth.id;
    const { name, address, about, website_url, logo_url } = req.body;

    console.log("Update payload:", req.body);

    const company = await Company.findByPk(companyId);
    if (!company) return res.status(404).json({ message: "Company not found" });

    if (name !== undefined) company.name = name;
    if (address !== undefined) company.address = address;
    if (about !== undefined) company.about = about;
    if (website_url !== undefined) company.website_url = website_url;
    if (logo_url !== undefined) company.logo_url = logo_url;

    await company.save();
    res.json({ message: "✅ Profile updated", company });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};



