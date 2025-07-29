// models/Resume.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Resume = sequelize.define("resumes", {
  resume_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  company_id: { type: DataTypes.INTEGER, allowNull: false },
  role_id: { type: DataTypes.INTEGER, allowNull: true },
  resume_type: { type: DataTypes.ENUM("employee", "baseline"), allowNull: false },
  file_path: { type: DataTypes.STRING(500), allowNull: false },
  parsed_text: { type: DataTypes.TEXT("long"), allowNull: true },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  tableName: "resumes",
  timestamps: false,
});

module.exports = Resume;
