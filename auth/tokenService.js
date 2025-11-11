const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const RefreshToken = require('../db/refreshTokenModel');

const ACCESS_EXPIRES = '7d'; // 7 days

function signAccessToken(user) {
  const payload = {
    _id: user._id,
    userId: user._id,
    luser: user.user_id,
  };
  const secret = process.env.JWT_SECRET || 'RANDOM-TOKEN';
  const token = jwt.sign(payload, secret, { expiresIn: ACCESS_EXPIRES });
  return token;
}

function generateRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

async function saveRefreshToken(userId, token, ttlDays = 30) {
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  await RefreshToken.create({ user: userId, token, expiresAt });
}

async function revokeRefreshToken(token) {
  await RefreshToken.deleteOne({ token });
}

async function verifyRefreshToken(token) {
  if (!token) return null;
  const doc = await RefreshToken.findOne({ token });
  if (!doc) return null;
  if (doc.expiresAt < new Date()) { await RefreshToken.deleteOne({ _id: doc._id }); return null; }
  return doc;
}

module.exports = { signAccessToken, generateRefreshToken, saveRefreshToken, revokeRefreshToken, verifyRefreshToken };
