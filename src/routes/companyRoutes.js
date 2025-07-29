const express = require("express");
const router = express.Router();
const { registerCompany, loginCompany, getCompanyStats, updateCompanyProfile, getCompanyProfile } = require("../controllers/companyController");
const { verifyToken } = require("../middlewares/authMiddleware");

// Register company
router.post("/register", registerCompany);
router.post("/login", loginCompany);

router.get("/stats", verifyToken, getCompanyStats);
router.put("/profile", verifyToken, updateCompanyProfile);
router.get("/profile", verifyToken, getCompanyProfile);
    

module.exports = router;
