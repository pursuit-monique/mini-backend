const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Profile schema
const { Schema } = mongoose;

const ProfileSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    password: { type: String, required: true },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    title: { type: String, trim: true },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: props => `${props.value} is not a valid email`,
      },
    },
    phone: { type: String, trim: true },
    is_available: { type: Boolean, default: false },
    profile_image_url: { type: String, trim: true },
    org: { type: Schema.Types.ObjectId, ref: 'Org' },
  },
  { timestamps: true }
);

const Profile = mongoose.models.Profile || mongoose.model('Profile', ProfileSchema);

// Helpers
const UnauthorizedError = (msg = 'Unauthorized') => {
  const e = new Error(msg);
  e.status = 401;
  return e;
};
const BadRequestError = (msg = 'Bad Request') => {
  const e = new Error(msg);
  e.status = 400;
  return e;
};

// Verify referenced Org id exists if provided
async function verifyOrg(orgId) {
  if (orgId) {
    const Org = mongoose.model('Org');
    if (!(await Org.exists({ _id: orgId }))) throw BadRequestError('Organization not found');
  }
}

// JWT auth middleware factory
function jwtAuth(secret) {
  if (!secret || typeof secret !== 'string') {
    throw new Error('jwtAuth requires a JWT secret string');
  }
  return (req, res, next) => {
    const auth = req.headers && req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return next(UnauthorizedError('Missing Authorization header or token'));
    }
    const token = auth.slice(7).trim();
    try {
      const payload = jwt.verify(token, secret);
      const id = payload && (payload._id || payload.userId);
      const pub = payload && payload.luser;
      if (!id) return next(UnauthorizedError('Token payload missing user id'));
      if (!pub) return next(UnauthorizedError('Token payload missing luser - reauthenticate'));
      req.user = { id };
      req.user.luser = pub;
      return next();
    } catch (err) {
      return next(UnauthorizedError('Invalid or expired token'));
    }
  };
}

// Create profile
async function createProfile(authUserId, payload) {
  if (!authUserId) throw UnauthorizedError('Not authenticated');
  if (!payload || !payload.user) throw BadRequestError('Missing user id in payload');

  if (authUserId.toString() !== payload.user.toString()) throw UnauthorizedError('Cannot create profile for another user');

  await verifyOrg(payload.org);

  const existing = await Profile.findOne({ user: payload.user });
  if (existing) throw BadRequestError('Profile already exists for this user');

  const doc = new Profile({
    user: payload.user,
    password: payload.password,
    firstName: payload.firstName,
    lastName: payload.lastName,
    title: payload.title,
    email: payload.email,
    phone: payload.phone,
    is_available: !!payload.is_available,
    org: payload.org,
  });

  await doc.save();
  const p = await Profile.findById(doc._id).populate({ path: 'org', select: 'name' });
  const obj = p.toObject();
  if (!obj.profile_image_url) obj.profile_image_url = 'https://via.placeholder.com/150';
  return obj;
}

// Get profile (public view allowed)
async function getProfile(targetUserId) {
  if (!targetUserId) throw BadRequestError('Missing user id');
  const p = await Profile.findOne({ user: targetUserId }).populate({ path: 'org', select: 'name' });
  if (!p) return null;
  const obj = p.toObject();
  if (!obj.profile_image_url) obj.profile_image_url = 'https://via.placeholder.com/150';
  return obj;
}

// Get profile by public user_id string
async function getProfileByUserId(publicUserId) {
  if (!publicUserId) throw BadRequest
  const User = mongoose.model('User');
  const user = await User.findOne({ user_id: publicUserId }).select('_id user_id');
  if (!user) return null;
  const p = await Profile.findOne({ user: user._id }).populate({ path: 'org', select: 'name' });
  if (!p) return null;
  const obj = p.toObject();
  if (!obj.profile_image_url) obj.profile_image_url = 'https://via.placeholder.com/150';
  return obj;
}

// Update profile
async function updateProfile(targetUserId, authUserId, update) {
  if (!authUserId) throw UnauthorizedError('Not authenticated');
  if (!targetUserId) throw BadRequestError('Missing target user id');

  if (authUserId.toString() !== targetUserId.toString()) throw UnauthorizedError('Cannot update another user profile');

  await verifyOrg(update.org);

  const profile = await Profile.findOne({ user: targetUserId });
  if (!profile) throw BadRequestError('Profile not found');

  const allowed = ['password', 'firstName', 'lastName', 'title', 'email', 'phone', 'is_available', 'org'];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(update, key)) profile[key] = update[key];
  }

  await profile.save();
  const p = await Profile.findById(profile._id).populate({ path: 'org', select: 'name' });
  const obj = p.toObject();
  if (!obj.profile_image_url) obj.profile_image_url = 'https://via.placeholder.com/150';
  return obj;
}

// Delete profile
async function deleteProfile(targetUserId, authUserId) {
  if (!authUserId) throw UnauthorizedError('Not authenticated');
  if (!targetUserId) throw BadRequestError('Missing target user id');

  if (authUserId.toString() !== targetUserId.toString()) throw UnauthorizedError('Cannot delete another user profile');

  const profile = await Profile.findOne({ user: targetUserId });
  if (!profile) throw BadRequestError('Profile not found');

  await Profile.deleteOne({ _id: profile._id });
  return { deleted: true };
}

// Router factory
function createProfileRouter(requireAuth) {
  if (typeof requireAuth === 'string') {
    requireAuth = jwtAuth(requireAuth);
  }
  if (!requireAuth || typeof requireAuth !== 'function') {
    throw new Error('createProfileRouter requires an authentication middleware function or a JWT secret string');
  }

  const router = express.Router();

  // Public GET by userId
  router.get('/:userId', async (req, res, next) => {
    try {
      const result = await getProfile(req.params.userId);
      if (!result) return res.status(404).json({ message: 'Profile not found' });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Public GET by public user_id
  router.get('/by-userid/:userId', async (req, res, next) => {
    try {
      const result = await getProfileByUserId(req.params.userId);
      if (!result) return res.status(404).json({ message: 'Profile not found' });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Protected create
  router.post('/', requireAuth, async (req, res, next) => {
    try {
      const result = await createProfile(req.user.id, req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // Protected update
  router.patch('/:userId', requireAuth, async (req, res, next) => {
    try {
      const result = await updateProfile(req.params.userId, req.user.id, req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Protected delete
  router.delete('/:userId', requireAuth, async (req, res, next) => {
    try {
      const result = await deleteProfile(req.params.userId, req.user.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = {
  Profile,
  createProfile,
  getProfile,
  getProfileByUserId,
  updateProfile,
  deleteProfile,
  createProfileRouter,
  jwtAuth,
};

module.exports.ProfileModel = Profile || mongoose.model("Profile", ProfileSchema);
module.exports.default = Profile || mongoose.model("Profile", ProfileSchema);