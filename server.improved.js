const express = require("express"),
  path = require("path"),
  http = require("http"),
  app = express(),
  port = process.env.PORT || 3000,
  cookieParser = require("cookie-parser"),
  session = require("express-session"), //middleware for authentication
  passport = require("passport"), // middleware for authentication
  Local = require("passport-local").Strategy,
  bodyParser = require("body-parser"),
  morgan = require("morgan"), // middleware for logging HTTP requests
  helmet = require("helmet"), // middleware for setting HTTP headers
  responseTime = require("response-time"), // middleware for HTTP request response time
  StatsD = require("node-statsd"), // middleware for HTTP request response time
  mongodb = require("mongodb"),
  mime = require("mime"),
  dotenv = require("dotenv"),
  firebase = require("firebase");

dotenv.config();

//INTIALIZING FIREBASE
var firebaseConfig = {
  apiKey: process.env.apiKey,
  authDomain: process.env.authDomain,
  databaseURL: process.env.databaseURL,
  projectId: process.env.projectId,
  storageBucket: process.env.storageBucket,
  messagingSenderId: process.env.messageSenderId,
  appId: process.env.appId
};

firebase.initializeApp(firebaseConfig);
let fdb = firebase.database();

/*const uri =
  "mongodb+srv://anagha:" +
  process.env.MONGO_PASS +
  "@cluster0-vy0ms.azure.mongodb.net/admin?retryWrites=true&w=majority";

const client = new mongodb.MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
let currentUser = "";
let usersCollection = null;*/

app.use(express.static(path.join(__dirname + "public")));
app.use(bodyParser.json());
app.use(helmet());
//app.use(morgan("combined"));
app.use(cookieParser()); //needed to read cookies for auth

app.get("/", function(req, res) {
  res.sendFile(path.join(__dirname + "/index.html"));
});

app.get("/Temp.css", function(req, res) {
  res.sendFile(path.join(__dirname + "/Temp.css"));
});

app.get("/cover.png", function(req, res) {
  res.sendFile(path.join(__dirname + "/cover.png"));
});

app.get("/game.html", function(req, res) {
  res.sendFile(path.join(__dirname + "/game.html"));
});

app.get("/loginPage", function(req, res) {
  res.sendFile(path.join(__dirname + "/login.html"));
});

app.get("/game.js", function(req, res) {
  res.sendFile(path.join(__dirname + "/game.js"));
});

app.get("/TEMP.css", function(req, res) {
  res.sendFile(path.join(__dirname + "/game.js"));
});

app.get("/js/scripts.js", function(req, res) {
  res.sendFile(path.join(__dirname + "/js/scripts.js"));
});

const myLocalStrategy = function(username, password, done) {
  fdb
    .ref("/users/")
    .once("value")
    .then(function(snapshot) {
      const users = [];
      snapshot.forEach(function(child) {
        console.log(child.val());
        users.push(child.val());
      });
      let user = users.find(__user => __user.username === username);
      if (user === undefined) {
        console.log("NOT IN DB"); //not in database
        return done(null, false, { message: "user not found" });
      } else if (user.password === password) {
        return done(null, { username, password });
      } else {
        console.log("!PASSWORD");
        return done(null, false, { message: "incorrect password" });
      }
    });
  /*let user;
  usersCollection
    .find({})
    .toArray()
    .then(result => {
      console.log("TESTING " + result);
      user = result[0];
      console.log("Username: " + result);

      if (user.username === username && user.password === password) {
        currentUser = username;
        return done(null, { username, password });
      } else {
        return done(null, false, { message: "wrong password" });
      }
    });*/
};

passport.use(new Local(myLocalStrategy));

passport.serializeUser((user, done) => done(null, user.username));

passport.deserializeUser((username, done) => {
  fdb
    .ref("/users/")
    .once("value")
    .then(function(snapshot) {
      const users = [];
      snapshot.forEach(function(child) {
        users.push(child.val());
      });
      const user = users.find(u => u.username === username);
      console.log("deserializing: ", username);
      if (user !== undefined) {
        done(null, user);
      } else {
        done(null, false, { message: "user not found; session not restored" });
      }
    });
  /*let user;
  usersCollection
    .find({})
    .toArray()
    .then(result => {
      user = result[0];
      console.log("Query result: " + result);

      if (user !== undefined) {
        done(null, user);
      } else {
        done(null, false, { message: "no such user exists" });
      }
    });*/
});

app.use(
  session({
    secret: "supercalifragilesticexpialadocious",
    resave: false,
    saveUninitialized: false
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.post("/login", passport.authenticate("local"), function(req, res) {
  res.cookie("TestCookie", req.body.username);
  res.redirect("game.html");
});

app.post("/addSong", function(req, res) {
  fdb
    .ref("/data/")
    .once("value")
    .then(function(snapshot) {
      var tempArray = [];
      for (var i = 0; i < 8; i++) {
        if (req.body.songdata[i].length === 0) {
          console.log("IN EMPTY CASE");
          tempArray.push([{ noteVal: -1, timeVal: 0 }]);
        } else {
          tempArray.push(req.body.songdata[i]);
        }
      }
      console.log(tempArray);
      fdb
        .ref("/data/")
        .push({
          username: req.body.username,
          songname: req.body.songname,
          songdata: tempArray
        })
        .then(function(response) {
          res.status(200).send();
        });
    });
});

app.post("/addUser", function(req, res) {
  fdb
    .ref("/users/")
    .once("value")
    .then(function(snapshot) {
      const data = [];
      snapshot.forEach(function(child) {
        data.push(child.val());
      });
      let hasDup = checkForDuplicateUser(data, req.body);
      if (hasDup.exists) {
        res.status(409).send();
      } else {
        fdb
          .ref("/users/")
          .push({
            username: req.body.username,
            password: req.body.password
          })
          .then(function(response) {
            res.status(200).send();
          });
      }
    });
});

//DUPLICATE USER RETURNS BOOL AND INDEX
function checkForDuplicateUser(data, original) {
  let final = { exists: false, index: -1 };
  data.forEach(function(comp, index) {
    if (comp.username === original.username) {
      final = { exists: true, index: index };
    }
  });
  return final;
}

app.get("/allData", function(req, res) {
  fdb
    .ref("/data/")
    .once("value")
    .then(function(snapshot) {
      const data = [];
      snapshot.forEach(function(child) {
        data.push(child.val());
      });
      res.json(data);
    });
});

app.get("/logout", function(req, res) {
  req.logOut();
  res.status(200).clearCookie("TestCookie", {
    path: "/"
  });
  req.session.destroy(function(err) {
    res.redirect("/");
  });
});

//STARTING SERVER HERE
app.listen(process.env.PORT || port);
