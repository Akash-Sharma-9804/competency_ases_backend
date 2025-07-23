// models/Question.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Question = sequelize.define(
  "Question",
  {
    question_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    test_id: { type: DataTypes.INTEGER, allowNull: false },
    text: { type: DataTypes.TEXT, allowNull: false },            // ✅ matches your DB column
    source_type: {                                             // ✅ matches your DB column
      type: DataTypes.ENUM("resume", "role", "sector", "admin"),
      allowNull: false,
      defaultValue: "admin",
    },
    order_no: { type: DataTypes.INTEGER },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    tableName: "questions",
    timestamps: false,
  }
);

module.exports = Question;
