require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
const userRoutes = require("./src/routes/userRoutes");
const companyRoutes = require("./src/routes/companyRoutes");
const testRoutes = require("./src/routes/test");
app.use("/api/tests", testRoutes);
app.use("/api/companies", companyRoutes);

app.use("/api/users", userRoutes);

// Default test route
app.get("/", (req, res) => {
  res.send("✅ Backend is running...");
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
