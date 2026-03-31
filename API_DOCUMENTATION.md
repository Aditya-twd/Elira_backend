# Elira Backend API Documentation

This file separates APIs for:
- Admin/Officer Dashboard
- User/Victim App

## Base URLs

- Direct backend: `http://localhost:5000`
- Admin frontend proxy mode: use `/api/...` from the frontend app

## Common API

### GET /health
Service health check.

Response:
```json
{
  "success": true,
  "message": "Service is healthy",
  "timestamp": "2026-03-31T00:00:00.000Z"
}
```

---

## Admin/Officer Dashboard APIs

## 1) Authentication

### POST /auth/login
Officer login.

Request:
```json
{
  "email": "officer@test.com",
  "password": "123456"
}
```

Success:
```json
{
  "token": "<jwt_token>",
  "officer": {
    "id": "officer@test.com",
    "email": "officer@test.com"
  }
}
```

Failure:
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

Protected route header format:

`Authorization: Bearer <token>`

## 2) Evidence Access (Consent-Gated)

Officer can only list/view/verify evidence after victim consent is set to true.

### GET /evidence
Protected. Returns only consent-approved evidence metadata.

Success:
```json
[
  {
    "id": "1",
    "fileHash": "...",
    "arweaveTxId": "...",
    "fileType": "application/pdf",
    "consentGiven": true,
    "consentedAt": "2026-03-31T17:46:56.463Z",
    "createdAt": "2026-03-31T17:46:53.205Z"
  }
]
```

### GET /evidence/:id
Protected. Returns decrypted file binary for live preview or download.

Response:
- Binary file buffer
- `Content-Type` equals original file MIME type

Common errors:
```json
{
  "success": false,
  "message": "consent required"
}
```

```json
{
  "success": false,
  "message": "missing metadata"
}
```

```json
{
  "success": false,
  "message": "failed fetch/decryption"
}
```

### GET /evidence/:id/verify
Protected. Returns verification metadata.

Success:
```json
{
  "fileHash": "...",
  "arweaveTxId": "...",
  "polygonTxHash": "0x...",
  "status": "verified"
}
```

---

## User/Victim APIs

## 1) Upload Evidence

### POST /evidence/upload
Uploads evidence content (currently no victim auth middleware in MVP).

Backend flow:
1. Generate `fileHash`
2. Encrypt file content using AES
3. Upload encrypted bytes to Arweave via Irys
4. Try blockchain `storeEvidence(fileHash, arweaveTxId)`
5. Save metadata in memory

Request:
```json
{
  "fileContent": "...raw content...",
  "fileType": "application/pdf"
}
```

Success:
```json
{
  "success": true,
  "data": {
    "id": "1",
    "fileHash": "...",
    "arweaveTxId": "...",
    "polygonTxHash": "0x...",
    "consentGiven": false
  }
}
```

Notes:
- `id` is required for later consent + officer verification.
- `polygonTxHash` can be `null` if blockchain transaction fails.

## 2) Give/Revoke Consent

### POST /evidence/:id/consent
MVP endpoint used to mark victim consent status.

Request:
```json
{
  "consentGiven": true,
  "consentBy": "victim"
}
```

Success:
```json
{
  "success": true,
  "data": {
    "id": "1",
    "consentGiven": true,
    "consentedAt": "2026-03-31T17:46:56.463Z"
  }
}
```

---

## Error Format

Most failures use:

```json
{
  "success": false,
  "message": "<reason>"
}
```

---

## Local MVP Credentials (Officer)

- Email: `officer@test.com`
- Password: `123456`

---

## Integration Notes

Admin/Officer frontend:
1. Login with `POST /auth/login`
2. Store token and send `Authorization: Bearer <token>`
3. Use `GET /evidence` for consented list
4. For selected id:
   - `GET /evidence/:id/verify`
   - `GET /evidence/:id` for live preview buffer

User/Victim frontend:
1. Upload with `POST /evidence/upload`
2. Save returned `id`
3. Set consent with `POST /evidence/:id/consent`
