const express = require("express");
const router = express.Router();
const Sector = require("../models/sector");

// GET /sectors
router.get("/", async (req, res) => {
  try {
    const sectors = await Sector.findAll({
      attributes: ["sector_id", "name"],
      order: [["name", "ASC"]],
    });
    res.json(sectors);
  } catch (error) {
    console.error("Error fetching sectors:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
