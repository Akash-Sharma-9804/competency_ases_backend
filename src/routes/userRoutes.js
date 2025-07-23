const express = require("express");
const router = express.Router();
const { loginUser, registerUserByCompany, getCandidatesByCompany,registerUserSelf    } = require("../controllers/userController");
const { verifyToken } = require("../middlewares/authMiddleware");

// only login route is exposed
router.post("/login", loginUser);
// Company creates a new user
router.post("/register-by-company", verifyToken, registerUserByCompany);
router.post("/register", registerUserSelf); // 👈 self signup
// routes/userRoutes.js
router.get("/company-candidates", verifyToken, getCandidatesByCompany);




module.exports = router;
