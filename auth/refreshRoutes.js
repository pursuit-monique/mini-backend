const express = require('express');
const router = express.Router();
const { verifyRefreshToken, generateRefreshToken, saveRefreshToken, revokeRefreshToken, signAccessToken } = require('./tokenService');
const User = require('../db/userModel');

// exchange refresh token for new access token
router.post('/token', async (req, res) => {
  try {
    const provided = req.body.refreshToken || req.cookies && req.cookies.REFRESH_TOKEN;
    const found = await verifyRefreshToken(provided);
    if (!found) return res.status(401).json({ message: 'Invalid refresh token' });
    const user = await User.findById(found.user);
    if (!user) return res.status(401).json({ message: 'User not found' });
    // rotate refresh token
    await revokeRefreshToken(provided);
    const newRefresh = generateRefreshToken();
    await saveRefreshToken(user._id, newRefresh);
    const access = signAccessToken(user);
    // send tokens
    res.cookie('TOKEN', access, { httpOnly: true, sameSite: 'lax' });
    res.cookie('REFRESH_TOKEN', newRefresh, { httpOnly: true, sameSite: 'lax' });
    res.json({ token: access });
  } catch (err) {
    console.error('refresh token error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// revoke
router.post('/revoke', async (req, res) => {
  try {
    const provided = req.body.refreshToken || req.cookies && req.cookies.REFRESH_TOKEN;
    if (provided) await revokeRefreshToken(provided);
    res.json({ revoked: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
