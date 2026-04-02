const express = require('express');
const { login, testLogin } = require('../controllers/authController');

const router = express.Router();

router.post('/login', login);
router.post('/test-login', testLogin); // Quick test without Firestore

module.exports = router;
