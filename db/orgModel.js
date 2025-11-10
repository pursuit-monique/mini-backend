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
    const auth = req.headers && req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return next(UnauthorizedError('Missing Authorization header or token'));
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

  // verify specialties
  await verifySpecialties(payload.specialties);

  // owner_id = authenticated user id
  const ownerId = authUserId;
  // find User to get public user_id
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
  return obj;
}

async function getOrgById(id) {
  if (!id) throw BadRequestError('Missing org id');
  const p = await Org.findById(id).populate({ path: 'specialties' });
  if (!p) return null;
  const obj = p.toObject();
  if (!obj.org_image_url) obj.org_image_url = 'https://via.placeholder.com/300x200';
  return obj;
}

async function listOrgs() {
  const docs = await Org.find({}).populate({ path: 'specialties' });
  return docs.map(d => {
    const obj = d.toObject();
    if (!obj.org_image_url) obj.org_image_url = 'https://via.placeholder.com/300x200';
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

  const allowed = ['name','org_image_url','specialties','phone','address','city','state','zipcode','is_open','donations_needed','donations_acquired'];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(update, key)) org[key] = update[key];
  }

  await org.save();
  const p = await Org.findById(org._id).populate({ path: 'specialties' });
  const obj = p.toObject();
  if (!obj.org_image_url) obj.org_image_url = 'https://via.placeholder.com/300x200';
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
