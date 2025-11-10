const mongoose = require("mongoose");

// user schema
const UserSchema = new mongoose.Schema({
  // email field
  email: {
    type: String,
    required: [true, "Please provide an Email!"],
    unique: [true, "Email Exists"],
  },

  //   password field
  password: {
    type: String,
    required: [true, "Please provide a password!"],
    unique: false,
  },

  // short public user identifier
  user_id: {
    type: String,
    unique: true,
    required: true,
    trim: true,
    minlength: 8,
    maxlength: 8,
    index: true,
  },

  // optional short public organization identifier
  org_id: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    minlength: 8,
    maxlength: 8,
    index: true,
  },
});

// generate random 8-char mixed-case alphanumeric id
function generateUserId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

// pre-validate hook to ensure a unique user_id is generated for new users
UserSchema.pre('validate', async function (next) {
  if (!this.isNew) return next();

  if (!this.user_id) {
    const User = mongoose.models.User || mongoose.model('User', UserSchema);
    let tries = 0;
    while (tries < 10) {
      const candidate = generateUserId();
      // check uniqueness
      // use exists to avoid fetching full doc
      // eslint-disable-next-line no-await-in-loop
      const exists = await User.exists({ user_id: candidate });
      if (!exists) {
        this.user_id = candidate;
        break;
      }
      tries += 1;
    }
    if (!this.user_id) return next(new Error('Failed to generate unique user_id'));
  }
  return next();
});

// export User model (singular name 'User')
module.exports = mongoose.models.User || mongoose.model("User", UserSchema);
