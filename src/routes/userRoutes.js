const express = require("express");
const router = express.Router();
const { loginUser, registerUserByCompany, getCandidatesByCompany,registerUserSelf ,getUserProfile,updateUserProfile,uploadResume ,uploadPhoto,startTestNow  } = require("../controllers/userController");
const { verifyToken } = require("../middlewares/authMiddleware");


const multer = require("multer");
const upload = multer(); // memory storage



// only login route is exposed
router.post("/login", loginUser);
// Company creates a new user
router.post("/register-by-company", verifyToken, registerUserByCompany);
router.post("/register", registerUserSelf); // 👈 self signup
// routes/userRoutes.js
router.get("/company-candidates", verifyToken, getCandidatesByCompany);

router.post("/upload-resume", verifyToken, upload.single("resume"), uploadResume);
// routes/userRoutes.js
router.post("/upload-photo", verifyToken, upload.single("photo"), uploadPhoto);

router.post("/start-test/:testId", verifyToken, startTestNow);

// router.post("/upload-photo", verifyToken, upload.single("photo"), uploadPhoto);
// PUT /api/users/profile
router.put("/profile", verifyToken, updateUserProfile);
router.get('/profile', verifyToken, getUserProfile);


module.exports = router;
