const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const TestMaster = sequelize.define("test_master", {
  test_id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  company_id: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING, allowNull: false },
  job_role: { type: DataTypes.STRING, allowNull: false },
  job_sector: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  duration: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.ENUM('draft', 'active'), defaultValue: 'draft' },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: "test_master",
  timestamps: false
});

module.exports = TestMaster;
