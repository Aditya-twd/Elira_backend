function getHealth(req, res) {
  res.status(200).json({
    success: true,
    message: 'Service is healthy',
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  getHealth,
};
