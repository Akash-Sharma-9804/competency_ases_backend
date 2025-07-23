// models/Test.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Test = sequelize.define("tests", {
  test_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, allowNull: false },
  sector: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  duration: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.STRING, defaultValue: "Active" },
  company_id: { type: DataTypes.INTEGER, allowNull: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: "tests", timestamps: false });

module.exports = Test;
