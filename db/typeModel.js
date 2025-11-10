const mongoose = require('mongoose');
const { Schema } = mongoose;

// ensure we have a Type schema and model
let Type;
try {
  Type = mongoose.models.Type;
} catch (e) {
  Type = null;
}

if (!Type) {
  const TypeSchema = new Schema({
    name: { type: String, required: true, trim: true },
    code: { type: Number, required: false, index: true },
  }, { timestamps: true });

  Type = mongoose.model('Type', TypeSchema);
}

// Seed default types if they are missing
(async function ensureDefaultTypes() {
  try {
    const defaults = [
      { name: 'Case Management', code: 3 },
      { name: 'Food', code: 4 },
      { name: 'Housing', code: 2 },
      { name: 'Grant', code: 1 },
      { name: 'Spiritual', code: 5 },
    ];

    // if collection empty, insert all
    const count = await Type.countDocuments();
    if (count === 0) {
      await Type.insertMany(defaults);
      return;
    }

    // ensure each default exists by code or name
    for (const d of defaults) {
      const exists = await Type.findOne({ $or: [{ code: d.code }, { name: d.name }] });
      if (!exists) {
        await Type.create(d);
      }
    }
  } catch (err) {
    // log but don't crash the app
    // eslint-disable-next-line no-console
    console.error('Type seeding failed', err);
  }
}());

module.exports.TypeModel = Type || mongoose.model("Type", TypeSchema);
module.exports.default = Type || mongoose.model("Type", TypeSchema);
