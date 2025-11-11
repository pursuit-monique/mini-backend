const express = require('express');
const router = express.Router();
const { verifyRefreshToken, generateRefreshToken, saveRefreshToken, revokeRefreshToken, signAccessToken } = require('./tokenService');
const User = require('../db/userModel');

function maskToken(t) {
  if (!t) return null;
  if (t.length <= 12) return t;
  return `${t.slice(0,6)}...${t.slice(-6)}`;
}

// exchange refresh token for new access token
router.post('/token', async (req, res) => {
  try {
    console.debug('/auth/token called; cookies:', req.cookies ? Object.keys(req.cookies) : null);
    const provided = req.body.refreshToken || (req.cookies && req.cookies.REFRESH_TOKEN);
    console.debug('/auth/token provided token:', provided ? `${maskToken(provided)} (len ${provided.length})` : 'none');

    const found = await verifyRefreshToken(provided);
    if (!found) {
      console.warn('/auth/token: refresh token not found or expired');
      return res.status(401).json({ message: 'Invalid refresh token' });
    }
    console.debug('/auth/token: refresh token valid for user', found.user);

    const user = await User.findById(found.user);
    if (!user) {
      console.warn('/auth/token: user not found for refresh token');
      return res.status(401).json({ message: 'User not found' });
    }
    // rotate refresh token
    await revokeRefreshToken(provided);
    const newRefresh = generateRefreshToken();
    await saveRefreshToken(user._id, newRefresh);
    const access = signAccessToken(user);
    // send tokens
    res.cookie('TOKEN', access, { httpOnly: true, sameSite: 'lax' });
    res.cookie('REFRESH_TOKEN', newRefresh, { httpOnly: true, sameSite: 'lax' });
    console.debug('/auth/token: issued new access and refresh tokens for user', user._id);
    res.json({ token: access });
  } catch (err) {
    console.error('refresh token error', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Server error' });
  }
});

// revoke
router.post('/revoke', async (req, res) => {
  try {
    console.debug('/auth/revoke called; cookies:', req.cookies ? Object.keys(req.cookies) : null);
    const provided = req.body.refreshToken || (req.cookies && req.cookies.REFRESH_TOKEN);
    console.debug('/auth/revoke provided token:', provided ? maskToken(provided) : 'none');
    if (provided) await revokeRefreshToken(provided);
    res.json({ revoked: true });
  } catch (err) {
    console.error('/auth/revoke error', err && err.stack ? err.stack : err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
