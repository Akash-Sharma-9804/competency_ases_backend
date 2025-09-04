const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const SystemCheck = sequelize.define("SystemCheck", {
  check_id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  test_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  camera: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  microphone: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  speaker: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  network_speed: {
    type: DataTypes.STRING,
  },
  checked_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: "system_checks",
  timestamps: false,
});

module.exports = SystemCheck;
