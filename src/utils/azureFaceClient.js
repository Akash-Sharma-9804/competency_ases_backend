// utils/azureFaceClient.js
const axios = require("axios");

const endpoint = process.env.AZURE_FACE_ENDPOINT; // e.g. https://quantumhash-face-api.cognitiveservices.azure.com/
const apiKey = process.env.AZURE_FACE_KEY;        // from Azure portal

const faceApi = axios.create({
  baseURL: `${endpoint}/face/v1.0`,
  headers: { "Ocp-Apim-Subscription-Key": apiKey },
});

// Detect face and return faceId
async function detectFace(imageUrl) {
  const res = await faceApi.post(
    "/detect?returnFaceId=true",
    { url: imageUrl },
    { headers: { "Content-Type": "application/json" } }
  );

  if (!res.data.length) throw new Error("No face detected in: " + imageUrl);
  return res.data[0].faceId;
}

// Verify two faceIds
async function verifyFaces(faceId1, faceId2) {
  const res = await faceApi.post("/verify", { faceId1, faceId2 });
  return res.data; // { isIdentical: true/false, confidence: 0–1 }
}

module.exports = { detectFace, verifyFaces };
