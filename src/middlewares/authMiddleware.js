const jwt = require('jsonwebtoken');

function requireOfficerAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      success: false,
      message: 'Missing JWT_SECRET in environment variables',
    });
  }

  const token = authHeader.slice('Bearer '.length).trim();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'officer') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden',
      });
    }

    req.officer = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
    });
  }
}

module.exports = {
  requireOfficerAuth,
};
