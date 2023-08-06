const path = require("path");
const fs = require("fs");
const express = require("express");
const router = express.Router();
const validator = require("validator");
const users = require("../models/users");
const posts = require("../models/posts");
const comments = require("../models/comments");
const crypto = require("crypto");
const UPLOAD_PATH =
  path.dirname(process.mainModule.filename) + "/public/images/";
const Upload = require("../classes/Upload");

router.use((req, res, next) => {
  const { user } = req.session;
  req.app.locals.isLoggedIn = user;
  req.app.locals.user = user;
  next();
});

router.get("/", async (req, res) => {
  try {
    const latestPosts = await posts.find().sort("-createdAt");
    const homePosts = [];
    for (let i = 0; i < latestPosts.length; i++) {
      let post = latestPosts[i];
      let singlePost = {};
      singlePost.id = post._id;
      singlePost.image = post.image;
      singlePost.description = post.description;
      singlePost.date = post.createdAt.toLocaleDateString();
      singlePost.user = await users.findOne({ username: post.user });
      homePosts.push(singlePost);
    }
    res.render("index", {
      title: "Home Page | IWP",
      posts: homePosts,
    });
  } catch (err) {
    res.sendStatus(500);
  }
});

router.get("/register", (req, res) => {
  res.render("register", { title: "Register Page | IWP" });
});

router.get("/login", (req, res) => {
  res.render("login", { title: "Login Page | IWP" });
});

router.get("/logout", (req, res) => {
  if (req.session.user) {
    delete req.session.user;
  }
  res.redirect("/login");
});

router.get("/posts/create", (req, res) => {
  if (req.session.user) {
    res.render("create", { title: "New Post | IWP" });
  } else {
    res.redirect("/login");
  }
});

router.get("/posts/:id", async (req, res) => {
  try {
    const post = await posts.findById(req.params.id);
    const user = await users.findOne({ username: post.user });
    const postComments = await comments
        .find({ _id: { $in: post.comments } })
        .sort("-createdAt");
    res.render("post", {
      title: `${user.username} | Post`,
      post: post,
      postUser: user,
      comments: postComments
    });
  } catch (err) {
    res.sendStatus(500);
  }
});

router.get("/profile/:username", async (req, res) => {
  const { username } = req.params;
  try {
    const user = await users.findOne({ username: username });
    if (user) {
      const userPosts = await posts
        .find({ _id: { $in: user.posts } })
        .sort("-createdAt");
      res.render("profile", {
        title: `${username} | Profile`,
        currentUser: user,
        posts: userPosts,
      });
    } else {
      res.sendStatus(404);
    }
  } catch (err) {
    res.sendStatus(500);
  }
});

router.get("/profile/:username/edit", async (req, res) => {
  if (req.session.user) {
    const { username } = req.params;
    try {
      const user = await users.findOne({ username: username });
      if (user) {
        res.render("edit", {
          title: `${username} | Profile Update`,
          currentUser: user,
        });
      } else {
        res.sendStatus(404);
      }
    } catch (err) {
      res.sendStatus(500);
    }
  } else {
    res.redirect("/login");
  }
});

router.post("/follow", async (req, res) => {
  const { follower, following, action } = req.body;
  try {
    switch (action) {
      case "follow":
        await Promise.all([
          users.findByIdAndUpdate(follower, {
            $push: { following: following },
          }),
          users.findByIdAndUpdate(following, {
            $push: { followers: follower },
          }),
        ]);
        break;
      case "unfollow":
        await Promise.all([
          users.findByIdAndUpdate(follower, {
            $pull: { following: following },
          }),
          users.findByIdAndUpdate(following, {
            $pull: { followers: follower },
          }),
        ]);
        break;
      default:
        break;
    }
    res.json({ done: true });
  } catch (err) {
    res.json({ done: false });
  }
});

router.post("/profile/:username/edit", async (req, res) => {
  if (req.session.user) {
    const { username } = req.params;
    try {
      const upload = new Upload({
        filename: "image",
        destination: UPLOAD_PATH + "profiles",
        newName: crypto
          .createHash("sha256")
          .update(Date.now().toString())
          .digest("hex"),
      });
      const uploaded = await upload.save(req, res);
      if (uploaded.done) {
        const { url, description } = uploaded.body;
        const { file } = uploaded;
        const data = {
          url,
          description,
          image: file.filename,
        };
        await users.findOneAndUpdate({ username: username }, { $set: data });
        res.json({ updated: true, username });
      } else {
        res.json({ updated: false });
      }
    } catch (err) {
      res.json(err);
    }
  } else {
    res.sendStatus(403);
  }
});

router.post("/posts/create", async (req, res) => {
  if (req.session.user) {
    try {
      const upload = new Upload({
        filename: "image",
        destination: UPLOAD_PATH + "posts",
        newName: crypto
          .createHash("sha256")
          .update(Date.now().toString())
          .digest("hex"),
      });
      const uploaded = await upload.save(req, res);
      if (uploaded.done) {
        const { description } = uploaded.body;
        const { file } = uploaded;
        const errors = [];
        if (validator.isEmpty(description)) {
          errors.push({
            param: "description",
            msg: "Description is a required field.",
          });
        }
        if (errors.length > 0) {
          fs.unlinkSync(file.path);
          res.json({ errors });
        } else {
          const newPost = new posts({
            description,
            image: file.filename,
            user: req.session.user.username,
          });
          newPost.save().then((post) => {
            users
              .findOneAndUpdate(
                { _id: req.session.user._id },
                { $push: { posts: post._id } }
              )
              .then((result) => {
                res.json({ created: true, postid: post._id });
              });
          });
        }
      } else {
        res.json({ created: false });
      }
    } catch (err) {
      res.json(err);
    }
  } else {
    res.sendStatus(403);
  }
});

router.post("/posts/:id/comments/create", async (req, res) => {
  if (req.session.user) {
    try {
      const { comment } = req.body;
      const newComment = new comments({
        description: comment,
        user: req.session.user.username,
      });
      newComment.save().then((comment) => {
        posts
          .findOneAndUpdate(
            { _id: req.params.id },
            { $push: { comments: comment._id } }
          )
          .then((result) => {
            res.json({ created: true, postid: req.params.id })
          });
      });
    } catch (err) {
      res.json(err);
    }
  } else {
    res.sendStatus(403);
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const encPwd = crypto.createHash("sha256").update(password).digest("hex");
  try {
    const user = await users.findOne({ email: email, password: encPwd });
    if (user) {
      req.session.user = user;
      res.json({ success: true, username: user.username });
    } else {
      res.json({ success: false });
    }
  } catch (err) {
    res.json({ success: false });
  }
});

router.post("/register", async (req, res) => {
  const { name, email, username, password, password_confirmation } = req.body;
  const errors = [];
  if (validator.isEmpty(name)) {
    errors.push({
      param: "name",
      msg: "Name is a required field.",
    });
  }
  if (!validator.isEmail(email)) {
    errors.push({
      param: "email",
      msg: "Invalid e-mail address.",
    });
  }
  if (!validator.isAlphanumeric(username)) {
    errors.push({
      param: "username",
      msg: "Invalid username.",
    });
  }
  if (validator.isEmpty(password)) {
    errors.push({
      param: "password",
      msg: "Password is a required field.",
    });
  }
  if (password !== password_confirmation) {
    errors.push({
      param: "password_confirmation",
      msg: "Passwords do not match.",
    });
  }
  try {
    const usernameExists = await users.countDocuments({ username: username });
    const emailExists = await users.countDocuments({ email: email });
    if (usernameExists === 1) {
      errors.push({
        param: "username",
        msg: "Username already taken.",
      });
    }
    if (emailExists === 1) {
      errors.push({
        param: "email",
        msg: "This e-mail address have an existing account.",
      });
    }
  } catch (err) {
    res.json({ error: err });
  }
  if (errors.length > 0) {
    res.json({ errors });
  } else {
    const encPwd = crypto.createHash("sha256").update(password).digest("hex");
    const newUser = new users({
      name,
      email,
      username,
      password: encPwd,
    });
    try {
      await newUser.save();
    } catch (err) {
      res.json({ error: err });
    }
    res.json({ success: true });
  }
});

router.get("/users", async (req, res) => {
  try {
    const latestUsers = await users.find().sort("-createdAt");
    const userProfiles = [];
    for (let i = 0; i < latestUsers.length; i++) {
      let user = latestUsers[i];
      let singleUser = {};
      singleUser.name = user.name;
      singleUser.username = user.username;
      singleUser.image = user.image;
      singleUser.url = user.url;
      singleUser.description = user.description;
      singleUser.posts = user.posts.length;
      singleUser.followers = user.followers.length;
      singleUser.following = user.following.length;
      userProfiles.push(singleUser);
    }
    res.render("users", {
      title: "Profiles | IWP",
      users: userProfiles,
    });
  } catch (err) {
    res.sendStatus(500);
  }
});

module.exports = router;
