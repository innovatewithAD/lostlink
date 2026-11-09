// Database functions for LostLink user accounts.
// These use the official MongoDB Node.js driver taught in the course.

function usersCollection(db) {
  return db.collection("users");
}

async function createUser(db, user) {
  return usersCollection(db).insertOne(user);
}

async function findUserByEmail(db, email) {
  return usersCollection(db).findOne({ email: email.trim().toLowerCase() });
}

async function createUserIndexes(db) {
  await usersCollection(db).createIndex({ email: 1 }, { unique: true });
}

module.exports = {
  usersCollection,
  createUser,
  findUserByEmail,
  createUserIndexes
};
