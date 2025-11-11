const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require('cookie-parser');

// require database connection
const dbConnect = require("./db/dbConnect");
const User = require("./db/userModel");
const auth = require("./auth");
const { createProfileRouter } = require('./db/profileModel');
const { createOrgRouter } = require('./db/orgModel');
const tokenService = require('./auth/tokenService');
const refreshRoutes = require('./auth/refreshRoutes');

// helper to generate 8-char mixed id
function generateId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

async function ensureUserId(user) {
  const UserModel = User;
  if (user.user_id) return user;
  // try up to 10 times
  for (let i = 0; i < 10; i++) {
    const candidate = generateId();
    // eslint-disable-next-line no-await-in-loop
    const exists = await UserModel.exists({ user_id: candidate });
    if (!exists) {
      user.user_id = candidate;
      // eslint-disable-next-line no-await-in-loop
      await user.save();
      return user;
    }
  }
  throw new Error('Failed to generate unique user_id');
}

// execute database connection
dbConnect();

// Curb CORS - allow credentials and echo origin (do not use wildcard when using cookies)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content, Accept, Content-Type, Authorization'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  // handle preflight
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// body parser + cookies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// mount refresh endpoints
app.use('/auth', refreshRoutes);

// logout endpoint - revoke refresh token and clear cookies
app.post('/auth/logout', async (req, res) => {
  try {
    const provided = (req.cookies && req.cookies.REFRESH_TOKEN) || req.body.refreshToken;
    if (provided) await tokenService.revokeRefreshToken(provided);
    res.clearCookie('TOKEN');
    res.clearCookie('REFRESH_TOKEN');
    res.json({ loggedOut: true });
  } catch (err) {
    console.error('logout error', err);
    res.status(500).json({ message: 'Logout failed' });
  }
});

app.get('/', (request, response) => {
  response.json({ message: 'Hey! This is your server response!' });
});

// cookie options helper
function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'None',
  };
}

// register endpoint
app.post('/register', async (request, response) => {
  try {
    const hashedPassword = await bcrypt.hash(request.body.password, 10);
    const user = new User({ email: request.body.email, password: hashedPassword });
    await ensureUserId(user);
    const result = await user.save();

    // sign access token (7 days)
    const accessToken = tokenService.signAccessToken(result);
    const refreshToken = tokenService.generateRefreshToken();
    await tokenService.saveRefreshToken(result._id, refreshToken);

    // set cookies
    response.cookie('TOKEN', accessToken, { ...cookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
    response.cookie('REFRESH_TOKEN', refreshToken, { ...cookieOptions(), maxAge: 30 * 24 * 60 * 60 * 1000 });

    response.status(201).json({ message: 'User Created Successfully', result, token: accessToken });
  } catch (err) {
    console.error('register error', err);
    response.status(500).json({ message: 'Error creating user', err });
  }
});

// login endpoint
app.post('/login', async (request, response) => {
  try {
    const user = await User.findOne({ email: request.body.email });
    if (!user) return response.status(404).json({ message: 'Email not found' });
    const passwordOk = await bcrypt.compare(request.body.password, user.password);
    if (!passwordOk) return response.status(400).json({ message: 'Passwords does not match' });

    const u = await ensureUserId(user);
    const accessToken = tokenService.signAccessToken(u);
    const refreshToken = tokenService.generateRefreshToken();
    await tokenService.saveRefreshToken(u._id, refreshToken);

    response.cookie('TOKEN', accessToken, { ...cookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
    response.cookie('REFRESH_TOKEN', refreshToken, { ...cookieOptions(), maxAge: 30 * 24 * 60 * 60 * 1000 });

    response.json({ message: 'Login Successful', email: u.email, token: accessToken });
  } catch (err) {
    console.error('login error', err);
    response.status(500).json({ message: 'Login failed', err });
  }
});

// free and auth endpoints (keep existing auth middleware if used elsewhere)
app.get('/free-endpoint', (request, response) => response.json({ message: 'You are free to access me anytime' }));
app.get('/auth-endpoint', auth, (request, response) => response.send({ message: 'You are authorized to access me' }));

// mount profile and org routers with JWT secret
app.use('/profiles', createProfileRouter(process.env.JWT_SECRET || 'RANDOM-TOKEN'));
app.use('/orgs', createOrgRouter(process.env.JWT_SECRET || 'RANDOM-TOKEN'));

module.exports = app;
