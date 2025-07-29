const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const UploadedFile = sequelize.define(
  "uploaded_files",
  {
    file_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER, allowNull: true }, // ✅ allow null
    user_id: { type: DataTypes.INTEGER, allowNull: true },
    original_filename: DataTypes.STRING,
    unique_filename: DataTypes.STRING,
    ftp_path: DataTypes.STRING,
    extracted_text: DataTypes.TEXT("long"),
    mime_type: DataTypes.STRING,
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  },
  { tableName: "uploaded_files", timestamps: false }
);


module.exports = UploadedFile;
