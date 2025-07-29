


const Test = require('./Test');
const TestMaster = require('./TestMaster');
const User = require('./User');
const Company = require("./Company");
const Resume = require("./Resume");

// Test associations
Test.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Test.belongsTo(TestMaster, { foreignKey: 'master_test_id', as: 'test_master' });
Test.belongsTo(Company, { foreignKey: "company_id", as: "company" });

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


module.exports = { Test, TestMaster, User, Company, Resume };
