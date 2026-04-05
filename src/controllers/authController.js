const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { collection } = require('../services/firestoreService');
const { logAdminAction } = require('../services/adminLogService');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeContacts(contacts) {
  if (!Array.isArray(contacts)) {
    return [];
  }

  return contacts
    .map((contact) => String(contact || '').trim())
    .filter(Boolean);
}

async function register(req, res, next) {
  try {
    const { name, email, password, phone } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    const trimmedName = String(name || '').trim();

    if (!trimmedName || !normalizedEmail || !password) {
      return res.status(400).json({
        success: false,
        message: 'name, email and password are required',
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: 'password must be at least 6 characters',
      });
    }

    const existingUserSnapshot = await collection('users')
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get();

    if (!existingUserSnapshot.empty) {
      const existingDoc = existingUserSnapshot.docs[0];
      const existingUser = existingDoc.data();
      return res.status(200).json({
        success: true,
        data: {
          id: (existingUser.id || existingDoc.id).toString(),
          name: (existingUser.name || '').toString(),
          email: (existingUser.email || normalizedEmail).toString(),
          phone: (existingUser.phone || '').toString(),
          role: (existingUser.role || 'citizen').toString(),
          existing: true,
        },
        message: 'Email already registered',
      });
    }

    const hashedPassword = await bcrypt.hash(String(password), 10);
    const userDocRef = collection('users').doc();
    const userRecord = {
      id: userDocRef.id,
      name: trimmedName,
      email: normalizedEmail,
      password: hashedPassword,
      phone: phone ? String(phone).trim() : null,
      role: 'citizen',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await userDocRef.set(userRecord);

    return res.status(201).json({
      success: true,
      data: {
        id: userRecord.id,
        name: userRecord.name,
        email: userRecord.email,
        phone: userRecord.phone,
        role: userRecord.role,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function upsertProfile(req, res, next) {
  try {
    const {
      userId,
      name,
      email,
      phone,
      gpsConsent,
      contacts,
      biometricEnabled,
      onboardingComplete,
      pin,
    } = req.body || {};

    const trimmedUserId = String(userId || '').trim();
    if (!trimmedUserId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
      });
    }

    const profileDocRef = collection('users').doc(trimmedUserId);
    const profileRecord = {
      id: trimmedUserId,
      updatedAt: new Date().toISOString(),
      onboardingComplete: Boolean(onboardingComplete),
      gpsConsent: Boolean(gpsConsent),
      biometricEnabled: Boolean(biometricEnabled),
      contacts: normalizeContacts(contacts),
    };

    const trimmedName = String(name || '').trim();
    if (trimmedName) {
      profileRecord.name = trimmedName;
    }

    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail) {
      profileRecord.email = normalizedEmail;
    }

    const trimmedPhone = String(phone || '').trim();
    if (trimmedPhone) {
      profileRecord.phone = trimmedPhone;
    }

    if (pin) {
      profileRecord.pinHash = await bcrypt.hash(String(pin), 10);
      profileRecord.pinUpdatedAt = new Date().toISOString();
    }

    await profileDocRef.set(profileRecord, { merge: true });

    return res.status(200).json({
      success: true,
      data: {
        id: profileRecord.id,
        name: profileRecord.name || '',
        email: profileRecord.email || '',
        phone: profileRecord.phone || '',
        gpsConsent: profileRecord.gpsConsent,
        contacts: profileRecord.contacts,
        biometricEnabled: profileRecord.biometricEnabled,
        onboardingComplete: profileRecord.onboardingComplete,
        updatedAt: profileRecord.updatedAt,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password) {
      return res.status(400).json({
        success: false,
        message: 'email and password are required',
      });
    }

    const officerSnapshot = await collection('officers')
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get();

    if (officerSnapshot.empty) {
      await logAdminAction({
        action: 'LOGIN',
        officerEmail: normalizedEmail,
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

/**
 * TEST LOGIN - Quick response for development
 * Use email: admin@police.gov, password: admin123
 */
async function testLogin(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'email and password are required',
      });
    }

    // Quick test credentials
    if (email === 'admin@police.gov' && password === 'admin123') {
      if (!process.env.JWT_SECRET) {
        return res.status(500).json({
          success: false,
          message: 'Missing JWT_SECRET',
        });
      }

      const token = jwt.sign(
        {
          id: 'admin-001',
          email: 'admin@police.gov',
          role: 'officer',
        },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      );

      return res.status(200).json({
        token,
        officer: {
          id: 'admin-001',
          email: 'admin@police.gov',
        },
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid credentials',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Login failed: ' + error.message,
    });
  }
}

module.exports = {
  register,
  upsertProfile,
  login,
  testLogin,
};
