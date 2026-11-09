// Database functions for lost and found reports.
// The original reference filename is retained, but the data represents item reports.

function itemsCollection(db) {
  return db.collection("items");
}

async function createItem(db, item) {
  return itemsCollection(db).insertOne(item);
}

async function findAllItems(db) {
  return itemsCollection(db).find({}).sort({ createdAt: -1 }).toArray();
}

async function findItemsByUser(db, userId) {
  return itemsCollection(db).find({ userId }).sort({ createdAt: -1 }).toArray();
}

async function findItemById(db, itemId) {
  return itemsCollection(db).findOne({ _id: itemId });
}

async function updateItem(db, itemId, userId, changes) {
  return itemsCollection(db).updateOne(
    { _id: itemId, userId },
    { $set: { ...changes, updatedAt: new Date() } }
  );
}

async function markItemRecovered(db, itemId, userId) {
  return itemsCollection(db).updateOne(
    { _id: itemId, userId },
    { $set: { status: "Recovered", updatedAt: new Date() } }
  );
}

async function deleteItem(db, itemId, userId) {
  return itemsCollection(db).deleteOne({ _id: itemId, userId });
}

async function createItemIndexes(db) {
  await itemsCollection(db).createIndex({ userId: 1, createdAt: -1 });
  await itemsCollection(db).createIndex({ createdAt: -1 });
}

module.exports = {
  itemsCollection,
  createItem,
  findAllItems,
  findItemsByUser,
  findItemById,
  updateItem,
  markItemRecovered,
  deleteItem,
  createItemIndexes
};
