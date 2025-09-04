const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Answer = sequelize.define('Answer', {
  answer_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  test_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'test_master',
      key: 'test_id'
    }
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  question_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'questions',
      key: 'question_id'
    }
  },
  final_transcript: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  score: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true
  },
  ai_score: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('answered', 'skipped', 'rerecorded', 'not_attempted'),
    allowNull: true,
    defaultValue: 'not_attempted'
  },
  attempt_number: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 1
  },
  audio_url: {
    type: DataTypes.STRING(1000),
    allowNull: true
  },
  duration_seconds: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  submitted_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'answers',
  timestamps: false
});

module.exports = Answer;
