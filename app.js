const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// require database connection
const dbConnect = require("./db/dbConnect");
const User = require("./db/userModel");
const auth = require("./auth");
const { createProfileRouter } = require('./db/profileModel');
const { createOrgRouter } = require('./db/orgModel');

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

// Curb Cores Error by adding a header here
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content, Accept, Content-Type, Authorization"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  next();
});

// body parser configuration
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (request, response, next) => {
  response.json({ message: "Hey! This is your server response!" });
  next();
});

// register endpoint
app.post("/register", (request, response) => {
  // hash the password
  bcrypt
    .hash(request.body.password, 10)
    .then(async (hashedPassword) => {
      // create a new user instance and collect the data
      const user = new User({
        email: request.body.email,
        password: hashedPassword,
      });

      // ensure public user_id exists BEFORE saving to satisfy validation
      try {
        await ensureUserId(user);
      } catch (err) {
        // proceed; ensureUserId will throw only if it fails to generate an id
        return response.status(500).send({ message: 'Failed to generate user_id', err });
      }

      // save the new user
      user
        .save()
        // return success if the new user is added to the database successfully
        .then((result) => {
          try {
            // create JWT token including public user_id
            const token = jwt.sign(
              {
                userId: result._id,
                userEmail: result.email,
                luser: result.user_id,
              },
              "RANDOM-TOKEN",
              { expiresIn: "24h" }
            );

            response.status(201).send({
              message: "User Created Successfully",
              result,
              token,
            });
          } catch (err) {
            response.status(201).send({ message: 'User created but failed to issue token', result });
          }
        })
        // catch erroe if the new user wasn't added successfully to the database
        .catch((error) => {
          response.status(500).send({
            message: "Error creating user",
            error,
          });
        });
    })
    // catch error if the password hash isn't successful
    .catch((e) => {
      response.status(500).send({
        message: "Password was not hashed successfully",
        e,
      });
    });
});

// login endpoint
app.post("/login", (request, response) => {
  // check if email exists
  User.findOne({ email: request.body.email })

    // if email exists
    .then((user) => {
      if (!user) {
        return response.status(404).send({ message: 'Email not found' });
      }
      // compare the password entered and the hashed password found
      bcrypt
        .compare(request.body.password, user.password)

        // if the passwords match
        .then(async (passwordCheck) => {

          // check if password matches
          if(!passwordCheck) {
            return response.status(400).send({
              message: "Passwords does not match",
            });
          }

          try {
            // ensure user_id exists for older users
            const u = await ensureUserId(user);

            //   create JWT token
            const token = jwt.sign(
              {
                userId: u._id,
                userEmail: u.email,
                luser: u.user_id,
              },
              "RANDOM-TOKEN",
              { expiresIn: "24h" }
            );

            //   return success response
            response.status(200).send({
              message: "Login Successful",
              email: u.email,
              token,
            });
          } catch (err) {
            response.status(500).send({ message: 'Failed to ensure user_id', err });
          }
        })
        // catch error if password do not match
        .catch((error) => {
          response.status(400).send({
            message: "Passwords does not match",
            error,
          });
        });
    })
    // catch error if email does not exist
    .catch((e) => {
      response.status(404).send({
        message: "Email not found",
        e,
      });
    });
});

// free endpoint
app.get("/free-endpoint", (request, response) => {
  response.json({ message: "You are free to access me anytime" });
});

// authentication endpoint
app.get("/auth-endpoint", auth, (request, response) => {
  response.send({ message: "You are authorized to access me" });
});

// mount profiles router (public GET, protected create/update/delete)
app.use('/profiles', createProfileRouter('RANDOM-TOKEN'));
// mount orgs router
app.use('/orgs', createOrgRouter('RANDOM-TOKEN'));

module.exports = app;
