const mongoose = require('mongoose');
const { Schema } = mongoose;

const TypeSchema = new Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
}, { timestamps: true });

module.exports = mongoose.models.Type || mongoose.model('Type', TypeSchema);
