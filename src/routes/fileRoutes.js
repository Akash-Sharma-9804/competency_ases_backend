const express = require("express");
const router = express.Router();
const multer = require("multer");
const fileController = require("../controllers/fileController");
const { verifyToken } = require("../middlewares/authMiddleware");

const upload = multer(); // memory storage

router.post("/upload",  verifyToken,  upload.array("files"), fileController.uploadFile);

module.exports = router;
