const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const { Schema } = mongoose;

// ensure Type model is registered
require('./typeModel');

const OrgSchema = new Schema(
  {
    owner_id: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // actual user _id
    owner_user_id: { type: String, required: true, trim: true, index: true }, // public user_id for joins
    org_id: { type: String, required: true, trim: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    org_image_url: { type: String, trim: true },
    specialties: [{ type: Schema.Types.ObjectId, ref: 'Type' }],
    specialty_codes: [{ type: Number }], // numeric codes (frontend convenience)
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zipcode: { type: String, trim: true },
    is_open: { type: Boolean, default: false },
    donations_needed: { type: Number, default: 0 },
    donations_acquired: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Org = mongoose.models.Org || mongoose.model('Org', OrgSchema);

const UnauthorizedError = (msg = 'Unauthorized') => { const e = new Error(msg); e.status = 401; return e; };
const BadRequestError = (msg = 'Bad Request') => { const e = new Error(msg); e.status = 400; return e; };

function jwtAuth(secret) {
  if (!secret || typeof secret !== 'string') throw new Error('jwtAuth requires a JWT secret string');
  return (req, res, next) => {
    const authHeader = req.headers && req.headers.authorization;
    let token;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (req.cookies && req.cookies.TOKEN) {
      token = req.cookies.TOKEN;
    }

    if (!token) {
      console.warn('jwtAuth: missing Authorization header and no TOKEN cookie on', req.path);
      return next(UnauthorizedError('Missing Authorization header or token'));
    }

    try {
      console.debug('jwtAuth: token length', token.length, 'for', req.path);
      const payload = jwt.verify(token, secret);
      console.debug('jwtAuth: decoded payload', payload);
      const id = payload && (payload._id || payload.userId || payload.user_id || payload.id);
      const pub = payload && (payload.luser || payload.user_id || payload.publicUserId || payload.public_id);
      if (!id) {
        console.warn('jwtAuth: token payload missing user id for', req.path, 'payload:', payload);
        return next(UnauthorizedError('Token payload missing user id'));
      }
      req.user = { id };
      if (pub) req.user.luser = pub;
      return next();
    } catch (err) {
      console.error('jwtAuth: token verification failed for', req.path, 'error:', err && err.message);
      return next(UnauthorizedError('Invalid or expired token'));
    }
  };
}

// ensure specialties exist if provided
async function verifySpecialties(ids = []) {
  if (!ids || !ids.length) return;
  const Type = mongoose.model('Type');
  const count = await Type.countDocuments({ _id: { $in: ids } });
  if (count !== ids.length) throw BadRequestError('One or more specialties not found');
}

// helper to generate 8-char id
function generateId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

async function createOrg(authUserId, payload) {
  if (!authUserId) throw UnauthorizedError('Not authenticated');
  if (!payload || !payload.name) throw BadRequestError('Missing organization name');

  // verify specialties if provided as ObjectId array
  if (payload.specialties && payload.specialties.length) {
    await verifySpecialties(payload.specialties);
  }

  // owner_id = authenticated user id
  const ownerId = authUserId;
  // find
  const User = mongoose.model('User');
  const user = await User.findById(ownerId).select('user_id org_id');
  if (!user) throw BadRequestError('Owner user not found');

  // generate unique org_id
  const OrgModel = mongoose.models.Org || mongoose.model('Org');
  let orgIdCandidate;
  for (let i = 0; i < 10; i++) {
    const c = generateId();
    // eslint-disable-next-line no-await-in-loop
    const exists = await OrgModel.exists({ org_id: c });
    if (!exists) { orgIdCandidate = c; break; }
  }
  if (!orgIdCandidate) throw new Error('Failed to generate unique org_id');

  const doc = new Org({
    owner_id: ownerId,
    owner_user_id: user.user_id,
    org_id: orgIdCandidate,
    name: payload.name,
    org_image_url: payload.org_image_url,
    specialties: payload.specialties || [],
    specialty_codes: payload.specialty_codes || [],
    phone: payload.phone,
    address: payload.address,
    city: payload.city,
    state: payload.state,
    zipcode: payload.zipcode,
    is_open: !!payload.is_open,
    donations_needed: Number(payload.donations_needed) || 0,
    donations_acquired: Number(payload.donations_acquired) || 0,
  });

  await doc.save();
  // write back org_id to user if not set
  if (!user.org_id) {
    user.org_id = orgIdCandidate;
    // eslint-disable-next-line no-await-in-loop
    await user.save();
  }
  const p = await Org.findById(doc._id).populate({ path: 'specialties' });
  const obj = p.toObject();
  if (!obj.org_image_url) obj.org_image_url = 'https://via.placeholder.com/300x200';
  if (!obj.specialty_codes) obj.specialty_codes = [];
  return obj;
}

async function getOrgById(id) {
  if (!id) throw BadRequestError('Missing org id');
  const p = await Org.findById(id).populate({ path: 'specialties' });
  if (!p) return null;
  const obj = p.toObject();
  if (!obj.org_image_url) obj.org_image_url = 'https://via.placeholder.com/300x200';
  if (!obj.specialty_codes) obj.specialty_codes = (obj.specialties || []).map(s => s.id || s);
  // hide internal fields from public response
  delete obj._id;
  delete obj.owner_id;
  return obj;
}

async function listOrgs() {
  const docs = await Org.find({}).populate({ path: 'specialties' });
  return docs.map(d => {
    const obj = d.toObject();
    if (!obj.org_image_url) obj.org_image_url = 'https://via.placeholder.com/300x200';
    if (!obj.specialty_codes) obj.specialty_codes = (obj.specialties || []).map(s => s.id || s);
    // hide internal fields from public response
    delete obj._id;
    delete obj.owner_id;
    return obj;
  });
}

async function updateOrg(id, authUserId, update) {
  if (!authUserId) throw UnauthorizedError('Not authenticated');
  if (!id) throw BadRequestError('Missing org id');

  const org = await Org.findById(id);
  if (!org) throw BadRequestError('Org not found');

  if (org.owner_id.toString() !== authUserId.toString()) throw UnauthorizedError('Cannot modify org you do not own');

  if (update.specialties) await verifySpecialties(update.specialties);

  const allowed = ['name','org_image_url','specialties','specialty_codes','phone','address','city','state','zipcode','is_open','donations_needed','donations_acquired'];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(update, key)) org[key] = update[key];
  }

  await org.save();
  const p = await Org.findById(org._id).populate({ path: 'specialties' });
  const obj = p.toObject();
  if (!obj.org_image_url) obj.org_image_url = 'https://via.placeholder.com/300x200';
  if (!obj.specialty_codes) obj.specialty_codes = (obj.specialties || []).map(s => s.id || s);
  return obj;
}

async function deleteOrg(id, authUserId) {
  if (!authUserId) throw UnauthorizedError('Not authenticated');
  if (!id) throw BadRequestError('Missing org id');

  const org = await Org.findById(id);
  if (!org) throw BadRequestError('Org not found');
  if (org.owner_id.toString() !== authUserId.toString()) throw UnauthorizedError('Cannot delete org you do not own');

  await Org.deleteOne({ _id: id });
  return { deleted: true };
}

function createOrgRouter(requireAuth) {
  if (typeof requireAuth === 'string') requireAuth = jwtAuth(requireAuth);
  if (!requireAuth || typeof requireAuth !== 'function') throw new Error('createOrgRouter requires auth middleware or JWT secret');

  const router = express.Router();

  // public list
  router.get('/', async (req, res, next) => {
    try {
      const result = await listOrgs();
      res.json(result);
    } catch (err) { next(err); }
  });

  // public get by id
  router.get('/:id', async (req, res, next) => {
    try {
      const result = await getOrgById(req.params.id);
      if (!result) return res.status(404).json({ message: 'Org not found' });
      res.json(result);
    } catch (err) { next(err); }
  });

  // protected create
  router.post('/', requireAuth, async (req, res, next) => {
    try {
      const result = await createOrg(req.user.id, req.body);
      res.status(201).json(result);
    } catch (err) { next(err); }
  });

  // protected patch
  router.patch('/:id', requireAuth, async (req, res, next) => {
    try {
      const result = await updateOrg(req.params.id, req.user.id, req.body);
      res.json(result);
    } catch (err) { next(err); }
  });

  // protected delete
  router.delete('/:id', requireAuth, async (req, res, next) => {
    try {
      const result = await deleteOrg(req.params.id, req.user.id);
      res.json(result);
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { Org, createOrg, getOrgById, listOrgs, updateOrg, deleteOrg, createOrgRouter, jwtAuth };

// also export the mongoose model directly for compatibility
module.exports.OrgModel = Org || mongoose.model("Org", OrgSchema);
module.exports.default = Org || mongoose.model("Org", OrgSchema);
