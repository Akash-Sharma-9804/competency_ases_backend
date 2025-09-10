require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000", "http://localhost:5174","https://competency-ases.vercel.app","https://competency.artlabss.com"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 5000;

// After defining models
require('./src/models/relations'); // <-- this sets up associations

// Middlewares
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:3000", "http://localhost:5174","https://competency-ases.vercel.app","https://competency.artlabss.com"],
  credentials: true
}));
app.use(express.json());

// Make io available to controllers
app.set('socketio', io);

// Routes
const userRoutes = require("./src/routes/userRoutes");
const companyRoutes = require("./src/routes/companyRoutes");
const testRoutes = require("./src/routes/testRoutes");
const fileRoutes = require("./src/routes/fileRoutes");
const sectorRoutes = require("./src/routes/sectorRoutes");
app.use("/api/files", fileRoutes);
app.use("/api/tests", testRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/sectors", sectorRoutes);

app.use("/api/users", userRoutes);

// Default test route
app.get("/", (req, res) => {
  res.send("✅ Backend is running...");
});

// Voice Test WebSocket Handler
console.log('🎤 Loading voice test handler...');
const voiceTestHandler = require('./src/handlers/voiceTestHandler');
voiceTestHandler(io);
console.log('✅ Voice test handler loaded');

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔗 WebSocket server ready`);
  console.log(`🎯 TTS endpoint: /api/tests/:id/question-audio/:questionNo`);
  console.log(`🎤 Voice test WebSocket: Ready for connections`);
});
