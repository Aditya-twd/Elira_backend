const { getDb } = require('../config/firebase');

function collection(name) {
  return getDb().collection(name);
}

module.exports = {
  collection,
};
