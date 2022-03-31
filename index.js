const express = require("express");
const mongoose = require("mongoose")
const app = express()
const cors = require("cors")
const ethers = require("ethers");


const {writeAllPoolData} = require("./db/apy")
const cron = require('node-cron');


//database
const URI = process.env.MONGODB_URI
mongoose.connect(URI)
const db = mongoose.connection

db.once('open', () => {
  console.log("Connected to database")
})

//cors
app.use(cors())
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "http://localhost:3000"); // update to match the domain you will make the request from
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
  });

//use JSON

app.use(express.json())

//route
const priceOracleRoute = require("./routes/price.js")
app.use('/price', priceOracleRoute)

const limitRoute = require("./routes/limit.js")
app.use("/limit", limitRoute)

const stopRoute = require("./routes/stop.js")
app.use("/stop", stopRoute)

const accDistRoute = require("./routes/accdist.js")
app.use("/accumulatordistributor", accDistRoute)

const chef = require("./routes/chef.js")
app.use("/chef", chef)

const chef2 = require("./routes/chef2.js")
app.use("/chef2", chef2)

const equityRouterRoute = require("./routes/equityRouter")
app.use("/router", equityRouterRoute)

const {poolDataRouter} = require("./db/apy.js")
app.use("/poolData", poolDataRouter)





//run it
const port = 8090 //for local

const PORT = process.env.PORT || 8090 //for prod
const HOST = process.env.PORT ? "0.0.0.0" : "localhost"
console.log(HOST)



app.listen(
  PORT,
    () => console.log(`SERVER RUNNING ON PORT ${PORT}`)
)

const task = cron.schedule('*/5 * * * *', async () => {
  writeAllPoolData()
  console.log("ran task")
});
task.start()