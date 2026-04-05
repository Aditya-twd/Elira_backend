const express = require('express');
const { register, upsertProfile, login, testLogin } = require('../controllers/authController');

const router = express.Router();

router.post('/register', register);
router.post('/profile', upsertProfile);
router.post('/login', login);
router.post('/test-login', testLogin); // Quick test without Firestore

module.exports = router;
