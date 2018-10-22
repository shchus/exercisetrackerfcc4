const express = require('express')
const app = express()
const bodyParser = require('body-parser')

const cors = require('cors')

const mongoose = require('mongoose')
mongoose.connect(process.env.MLAB_URI || 'mongodb://localhost/exercise-track' )


var Schema = mongoose.Schema;
var usersSchema = new Schema({
    username: { type: String, required: true }
});
var Users = mongoose.model('Users', usersSchema);

var exercisesSchema = new Schema({
  userId: { type: String, required: true },
  username: { type: String, required: true },
  description: { type: String, required: true },
  duration: { type: Number, required: true },
  date: String
});
var Exercises = mongoose.model('Exercises', exercisesSchema);


app.use(cors())

app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())


app.use(express.static('public'))


let dateHandler = (date, exercises) => { //test if the date field is valid
  let testReg = /\d\d\d\d-\d\d?-\d\d?/ig
  if (!date && !exercises) {
    return new Date()
  }
  else if (date && testReg.test(date) && new Date(date) != "Invalid Date") {
    return new Date(date)
  }
  else {
    return false
  }
}

let logHandler = (array, params) => {
  let from = params.from ? dateHandler(params.from, true) : false
  let to = params.to ? dateHandler(params.to, true) : false
  let limit = params.limit && Number(params.limit) ? Number(params.limit) : false
  let newArray = []
  
  let filterByDate = (exercise) => {
    if (from && !to && new Date(exercise.date) > new Date(from)) { // if from
      return exercise
    }
    else if (from && to && new Date(exercise.date) > new Date(from) 
                        && new Date(exercise.date) < new Date(to)) { // if from and to
      return exercise
    }
    else if (!from && to && new Date(exercise.date) < new Date(to)) { // if to
      return exercise
    }
    else if (!from && !to) { 
      return exercise
    }
  }
  newArray = array.filter((e) => filterByDate(e)).map( //create a new array of exercises by using filter and map
                          (e) => ({description:e.description, 
                                   duration:e.duration,
                                   date: new Date(e.date).toDateString()}))
  
  if(limit) { // test the limit
    newArray.splice(newArray.length - limit, newArray.length)
  }
  
  let j = {_id:array[0].userId, username:array[0].username}
  if (from) {j.from = new Date(from).toDateString()}
  if (to) {j.to = new Date(to).toDateString()}
  j.count = newArray.length
  j.log = newArray
  
  return j
}


app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

app.get('/api/exercise/users', (req, res) => {
  let usersArray = []
  Users.find({}, function(err, docs) {
    docs.forEach((u) => {
      usersArray = [...usersArray, ({_id:u._id, username:u.username})]
    })

    res.json(usersArray)
  })  
});

app.route('/api/exercise/log?').get( (req, res) => {
  if (req.query.userId) { // test if the userId= is not empty
    Exercises.find({userId:req.query.userId}, function(err, data) { // test if the user has exercises
      
      if (!err && data.length > 0) { // the user has exercises
        res.json(logHandler(data, req.query))
      }
      else if(!err && data.length === 0) { // the use does not have exercises yet
        Users.findOne({_id:req.query.userId}, function(err, data) { // test if the user exists
          if (!err && data) { // if user exists
            res.json({
              _id:data._id,
              username:data.username,
              count:0,
              log: []
            })            
          }
          else { // if user does not exist
            res.type("txt").send("user with the ID " + req.query.userId + " does NOT exist")
          }
        })
      }
      else { // if invalid userId=
        res.type("txt").send("Invalid userId=" + req.query.userId)
      }
      
    })    
  }
  else { // if the userId= is empty
    res.type("txt").send("userId= should NOT be empty")
  }
})
  

app.post('/api/exercise/new-user', (req, res) => {
  if (req.body.username) { //test if the input field isn't empty
    Users.findOne({username:req.body.username}, function(err, data) {

      if (!err && !data) { //test and create username if it isn't in the db
        Users.create(
          {username:req.body.username},
          function (err, data) {
            res.json({"username": data.username ,"_id": data._id})
          }
        )
      }
      else if (!err && data) { //if the name is in db
        res.type("txt").send("the username " + req.body.username + " already created")
      }
      
    })
  }  
  else { //is the input field is empty
    res.type("txt").send("the`username` field is required")
  }
});

app.post('/api/exercise/add', (req, res) => {
  if (!req.body.userId || !req.body.description || !req.body.duration) { //test if the input fields are empty
    res.type("txt").send("userId, description and duration fields should NOT be empty")
  }
  else if (!Number(req.body.duration)) {
    res.type("txt").send("the duration field should be a NUMBER")           
  }
  else if (!dateHandler(req.body.date)) { //test if the date field is valid
    res.type("txt").send("the date " + req.body.date + " is NOT valid")
  }
  else { //add the exercise to the db
    Users.findOne({_id:req.body.userId}, function(err, data) { //test if the user exists      
      if (!err && data) { //if the user exists        
        Exercises.create({
          userId:req.body.userId, 
          username: data.username,
          description: req.body.description,
          duration: Number(req.body.duration),
          date: dateHandler(req.body.date)
        }, function(err, data) {
          if (!err) {
            res.json({
              _id: data.userId, 
              username: data.username, 
              description: data.description,
              duration: data.duration,
              date: new Date(data.date).toDateString()
            })
          }
        })
      }
      else { // if the user does not exist
        res.type("txt").send("user with the " + req.body.userId + " ID does NOT exist") 
      }
    })
  }
});


// Not found middleware
app.use((req, res, next) => {
  return next({status: 404, message: 'not found'})
})

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
})


const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})


