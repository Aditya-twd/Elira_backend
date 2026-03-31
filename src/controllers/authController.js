const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { collection } = require('../services/firestoreService');
const { logAdminAction } = require('../services/adminLogService');

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'email and password are required',
      });
    }

    const officerSnapshot = await collection('officers')
      .where('email', '==', String(email).toLowerCase())
      .limit(1)
      .get();

    if (officerSnapshot.empty) {
      await logAdminAction({
        action: 'LOGIN',
        officerEmail: String(email).toLowerCase(),
        status: 'failed',
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const officerDoc = officerSnapshot.docs[0];
    const officer = officerDoc.data();
    const isValid = await bcrypt.compare(password, officer.password);

    if (!isValid) {
      await logAdminAction({
        action: 'LOGIN',
        officerEmail: officer.email,
        officerId: officer.id || officerDoc.id,
        status: 'failed',
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: 'Missing JWT_SECRET in environment variables',
      });
    }

    const token = jwt.sign(
      {
        id: officer.id || officerDoc.id,
        email: officer.email,
        role: officer.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    await logAdminAction({
      action: 'LOGIN',
      officerEmail: officer.email,
      officerId: officer.id || officerDoc.id,
      status: 'success',
    });

    return res.status(200).json({
      token,
      officer: {
        id: officer.id || officerDoc.id,
        email: officer.email,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  login,
};
