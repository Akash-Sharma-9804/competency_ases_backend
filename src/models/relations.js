


const Test = require('./Test');
const TestMaster = require('./TestMaster');
const Question = require('./Question'); // make sure this is imported at the top
const User = require('./User');
const Company = require("./Company");
const Resume = require("./Resume");
const UserImageVerification = require("./UserImageVerification");
const Answer = require("./Answer");

// Test associations
Test.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Test.belongsTo(TestMaster, { foreignKey: 'master_test_id', as: 'test_master' });
Test.belongsTo(Company, { foreignKey: "company_id", as: "company" });
TestMaster.hasMany(Question, { foreignKey: 'test_id', as: 'questions' });
Question.belongsTo(TestMaster, { foreignKey: 'test_id', as: 'test_master' });
// Reverse associations
// ✅ This is important for getUserProfile to show company.name
User.belongsTo(Company, { foreignKey: "company_id", as: "company" });
User.hasMany(Test, { foreignKey: 'user_id', as: 'assigned_tests' });
TestMaster.hasMany(Test, { foreignKey: 'master_test_id', as: 'assigned_instances' });

// Resume associations
User.hasOne(Resume, { foreignKey: "user_id", as: "resume" });
User.hasMany(Resume, { foreignKey: "user_id" }); // 🔁 for .findAll includes
Resume.belongsTo(User, { foreignKey: "user_id", as: "user" });

Company.hasMany(Resume, { foreignKey: "company_id", as: "resumes" });
Resume.belongsTo(Company, { foreignKey: "company_id", as: "company" });

User.hasMany(UserImageVerification, { foreignKey: "user_id", as: "verifications" });
UserImageVerification.belongsTo(User, { foreignKey: "user_id", as: "user" });

// Answer associations
Answer.belongsTo(TestMaster, { foreignKey: "test_id", as: "test_master" });
Answer.belongsTo(User, { foreignKey: "user_id", as: "user" });
Answer.belongsTo(Question, { foreignKey: "question_id", as: "question" });
TestMaster.hasMany(Answer, { foreignKey: "test_id", as: "answers" });
User.hasMany(Answer, { foreignKey: "user_id", as: "answers" });
Question.hasMany(Answer, { foreignKey: "question_id", as: "answers" });

module.exports = { Test, TestMaster, User, Company, Resume, UserImageVerification, Question, Answer };
