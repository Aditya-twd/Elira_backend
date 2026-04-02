const express = require('express');
const {
	uploadEvidence,
	listEvidence,
	getEvidenceById,
	verifyEvidenceById,
	giveEvidenceConsent,
	generateEvidenceCertificate,
	generateEvidenceCertificates,
} = require('../controllers/evidenceController');
const { requireOfficerAuth } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/', requireOfficerAuth, listEvidence);
router.post('/certificate', requireOfficerAuth, generateEvidenceCertificates);
router.post('/:id/certificate', requireOfficerAuth, generateEvidenceCertificates);
router.get('/:id/verify', requireOfficerAuth, verifyEvidenceById);
router.get('/:id/certificate', requireOfficerAuth, generateEvidenceCertificate);
router.get('/:id', requireOfficerAuth, getEvidenceById);
router.post('/:id/consent', giveEvidenceConsent);
router.post('/upload', uploadEvidence);

module.exports = router;
