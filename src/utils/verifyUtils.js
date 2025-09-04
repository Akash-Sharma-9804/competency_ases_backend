// utils/verifyUtils.js
const fs = require("fs/promises");
const axios = require("axios");
const sharp = require("sharp");
const { detectFace, verifyFaces } = require("./azureFaceClient");
const genAI = require("./geminiClient");

let faceLandmarker;

// Download image and return buffer
async function downloadImage(url) {
  const res = await axios.get(url, { responseType: "arraybuffer" });
  return Buffer.from(res.data, "binary");
}

// Check if face is clear (image sharpness)
async function checkFaceClarity(imgUrl) {
  const imgBuffer = await downloadImage(imgUrl);
  const { data, info } = await sharp(imgBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true });

  let variance = 0;
  const gray = [];
  for (let i = 0; i < data.length; i += 3) {
    gray.push((data[i] + data[i + 1] + data[i + 2]) / 3);
  }

  const mean = gray.reduce((a, b) => a + b) / gray.length;
  for (let g of gray) {
    variance += (g - mean) ** 2;
  }
  variance /= gray.length;

  return variance > 500; // adjust threshold if needed
}

// Compare identity using Gemini Vision Pro
async function compareWithGemini(profileUrl, uploadedUrl) {
  console.log("[Gemini] Downloading profile image...");
  const profileImg = await downloadImage(profileUrl);
  console.log("[Gemini] Downloading uploaded image...");
  const uploadedImg = await downloadImage(uploadedUrl);

  console.log("[Gemini] Initializing Gemini model...");
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

  console.log("[Gemini] Sending images for comparison...");
  const prompt = `
You are an expert facial recognition system. Two images are given:
- Image 1: User's profile photo
- Image 2: Photo taken during test

Compare the two based only on face structure (eyes, nose, jaw, etc.), not on background, lighting, or expression.

Return a response in this exact JSON format:
{
  "match": true | false,
  "confidence": 0.0 - 1.0,
  "reason": "Short explanation"
}

Respond only with valid JSON.
`.trim();

const result = await model.generateContent([
  {
    inlineData: {
      mimeType: "image/jpeg",
      data: profileImg.toString("base64"),
    },
  },
  {
    inlineData: {
      mimeType: "image/jpeg",
      data: uploadedImg.toString("base64"),
    },
  },
  {
    text: prompt,
  },
]);

const text = await result.response.text();
console.log("[Gemini] Raw model response:", text);

// Clean markdown block if Gemini returns ```json ... ```
const cleaned = text.trim().replace(/^```json\s*|```$/g, '').trim();

try {
  const response = JSON.parse(cleaned);
  const passed = response.match === true && response.confidence >= 0.85;
  console.log("[Gemini] Parsed response:", response);
  return passed;
} catch (err) {
  console.warn("[Gemini] Failed to parse response:", err.message);
  return false;
}


}

// Compare identity using Azure Face API
async function compareWithAzure(profileUrl, uploadedUrl) {
  console.log("[Azure] Detecting face in profile image...");
  const profileId = await detectFace(profileUrl);

  console.log("[Azure] Detecting face in uploaded image...");
  const uploadedId = await detectFace(uploadedUrl);

  console.log("[Azure] Verifying faces...");
  const result = await verifyFaces(profileId, uploadedId);

  console.log("[Azure] Result:", result);
  const passed = result.isIdentical && result.confidence >= 0.6; // tweak threshold
  return passed;
}


module.exports = { checkFaceClarity, compareWithGemini ,compareWithAzure};
