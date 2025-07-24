// models/Test.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Test = sequelize.define(
  "tests",
  {
    test_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    master_test_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    company_id: { type: DataTypes.INTEGER, allowNull: false },
    role_id: { type: DataTypes.INTEGER, allowNull: true },
    resume_id: { type: DataTypes.INTEGER, allowNull: true },
    started_at: { type: DataTypes.DATE, allowNull: true },
    ended_at: { type: DataTypes.DATE, allowNull: true },
    total_score: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0.0 },
    status: {
      type: DataTypes.ENUM(
        "in_progress",
        "passed",
        "failed",
        "under_review"
      ),
      defaultValue: "in_progress",
    },
    webcam_recording_path: { type: DataTypes.STRING(500), allowNull: true },
    screen_recording_path: { type: DataTypes.STRING(500), allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    tableName: "tests",
    timestamps: false,
  }
);

module.exports = Test;
