const mongoose = require("mongoose");
const { MongoClient, ServerApiVersion } = require('mongodb');
require("dotenv").config();

async function dbConnect() {
  console.log("Connecting to MongoDB with URI:", process.env.DB_URL);

  mongoose
    .connect(process.env.DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // useCreateIndex is deprecated in Mongoose 6+, you can remove it safely
    })
    .then(() => {
      console.log("✅ Successfully connected to MongoDB Atlas!");
    })
    .catch((error) => {
      console.log("❌ Unable to connect to MongoDB Atlas!");
      console.error(error);
    });
}

module.exports = dbConnect;
