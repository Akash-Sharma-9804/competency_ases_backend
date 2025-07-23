const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Company = sequelize.define(
  "companies",
  {
    company_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    sector_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    address: {
      type: DataTypes.STRING,
    },
    contact_email: {
      type: DataTypes.STRING,
    },
    password: { type: DataTypes.STRING, allowNull: false }, // ✅ include this
       about: {
      type: DataTypes.TEXT,       // ✅ add this
      allowNull: true,
    },
    website_url: {
      type: DataTypes.STRING,     // ✅ add this
      allowNull: true,
    },
    logo_url: {
      type: DataTypes.STRING,     // ✅ add this
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "companies",
    timestamps: false,
  }
);

module.exports = Company;
