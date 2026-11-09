// Database functions for messages submitted through the contact form.

function inquiriesCollection(db) {
  return db.collection("inquiries");
}

async function createInquiry(db, inquiry) {
  return inquiriesCollection(db).insertOne({
    name: inquiry.name,
    email: inquiry.email,
    message: inquiry.message,
    createdAt: new Date()
  });
}

module.exports = { inquiriesCollection, createInquiry };
