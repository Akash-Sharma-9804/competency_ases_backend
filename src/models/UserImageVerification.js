// src/models/UserImageVerification.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const UserImageVerification = sequelize.define(
  "user_image_verifications",
  {
    verification_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    test_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    front_image_path: {
      type: DataTypes.STRING,
    },  
    left_image_path: {
      type: DataTypes.STRING,
    },
    right_image_path: {
      type: DataTypes.STRING,
    },
    is_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "user_image_verifications",
    timestamps: false,
  }
);

module.exports = UserImageVerification;
