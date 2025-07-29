const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const TestMaster = sequelize.define("test_master", {
  test_id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  company_id: { type: DataTypes.INTEGER, allowNull: true },
    user_id: { type: DataTypes.INTEGER, allowNull: true }, // ✅ New column
  title: { type: DataTypes.STRING, allowNull: false },
  job_role: { type: DataTypes.STRING, allowNull: false },
  job_sector: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  duration: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.ENUM('draft', 'active'), defaultValue: 'draft' },
    // ✅ Add these:
  scheduled_start: { type: DataTypes.DATE, allowNull: true },
  scheduled_end: { type: DataTypes.DATE, allowNull: true },
  is_deleted: { type: DataTypes.BOOLEAN, defaultValue: false },
deleted_at: { type: DataTypes.DATE, allowNull: true },

  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: "test_master",
  timestamps: false
});

module.exports = TestMaster;
