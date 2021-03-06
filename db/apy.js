const express = require("express")
const router = express.Router()
const mongoose = require("mongoose")
const axios = require("axios")
const {fetchAllPoolApyData} = require("./poolData")
require('dotenv').config()

const URI = process.env.MONGODB_URI
mongoose.connect(URI)

const dataSchema  = new mongoose.Schema({
    pid: {type: Number},
    symbol: {type: String},
    poolStakedAmount: {type: String},
    poolTVL: {type: String},
    APY: {type: String}    
})

const poolSchema = new mongoose.Schema({
    timestamp: {
        type: Date,
        set: d => new Date(d * 1000)
      },
    POOLS: [dataSchema]
})


const Pools = mongoose.model("Pools", poolSchema)


const createEntry = async (data) => {
    console.log(`Saving Data`)
    console.log(data)
    try {
        const entry = new Pools(
            {
                POOLS: data
            }
        )

        await entry.save()
        console.log(`new symbol: ${entry} saved`)
    } catch (err) {console.log(err)}
}




const writeAllPoolData = async () => {
    try {
        const data = await fetchAllPoolApyData()

        const justPoolData= data.map( (pool) => {
            return pool.POOL
        })
        await createEntry(justPoolData)
        console.log("created entry")
    } catch (err) {console.log(err)}

}

const readLatestPoolData = async () => {
try {    
    let lastDoc = (await Pools.find({}).sort({_id: -1}).limit(1))[0];
    return lastDoc
    } catch (err) {console.log(err)}
}

const poolDataRouter = router.get('/', async (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    try {
        const data = await readLatestPoolData()
        res.json(data)
    } catch (err) {
        res.status(500)
        res.json(err)
    }
})


module.exports = {
    poolDataRouter,
    writeAllPoolData,
    readLatestPoolData
}