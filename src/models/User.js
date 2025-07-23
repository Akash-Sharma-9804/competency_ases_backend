// src/models/User.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const User = sequelize.define(
  "users",
  {
    user_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
   
company_id: {
  type: DataTypes.INTEGER,
  allowNull: true,  // <--- allow null here
},

    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    photo_path: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "users",
    timestamps: false,
  }
);

module.exports = User;
