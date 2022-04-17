const {ethers} = require("ethers")
require('dotenv').config()
const express = require("express")
const router = express.Router()

const TOKENLIST = require("../utils/TOKENLIST.json")
const TOKENS = TOKENLIST["tokens"]
const ADDRESSES = require("../utils/build/deployments/map.json")
const RESOLVER = require("../utils/build/contracts/Resolver.json")
const {ROUTERS} = require("../utils/routers")




const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);

//web3shit
const fetchSigner = async () => {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
    
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
    
    const signer = wallet.connect(provider);
    console.log(`connected to ${signer.address}`);
    
    return signer;
};



const fetchContract = async (address, abi) => {
    const contract = new ethers.Contract(address, abi, provider);
    console.log(`loaded contract ${contract.address}`);
    return contract;
};//works

const _fetchRouter = async () => {
    const _router = fetchContract(
        ADDRESSES["137"]["Resolver"][0],
        RESOLVER.abi
    )
    return _router
}

const _fetchPrice = async (_tokenA, _tokenB, _amount, _router) => {
    const token = _matchToken(_tokenA)
    const amount = ethers.utils.parseUnits(_amount, token.decimals)
    console.log("QUERY")
    console.log(token)
    const callData = await _router.findBestPath(
        _tokenA,
        _tokenB,
        amount
    )
    return callData
}

const _matchRouter = (_routerAddress) => {
    const matchedRouter = ROUTERS.filter( (router) => {

        if (_routerAddress.toLowerCase() === router.address.toLowerCase()) {
            return router
        }
    })

    return matchedRouter[0]
    
}

const _matchToken = (_tokenAddress) => {
    const matchedToken = TOKENS.filter( (token) => {
        if (_tokenAddress.toLowerCase() === token["address"].toLowerCase()) {
            return token
        } 
    })
    return matchedToken[0]
}

const _cleanPriceData = async (_priceData) => {
    const bestRouter = _priceData[0]
    const bestPath = _priceData[1]

    const routerInfo = _matchRouter(bestRouter)
    const pathInfo = bestPath.map( (token) => {
        const _token = _matchToken(token)
        return _token
    })
    const bestAmountOut = ethers.utils.formatUnits(
        _priceData[2], 
        pathInfo[pathInfo.length - 1].decimals)

    return {
        router: routerInfo,
        path: pathInfo,
        amountOut: bestAmountOut
    }
}


const fetchRouterInfo = async (tokenA, tokenB, amountIn) => {
    try {
    const router = await _fetchRouter()
    const price = await _fetchPrice(
        tokenA,
        tokenB,
        amountIn,
        router
    )
    const data = await _cleanPriceData(price)
    return data
    } catch (err) {console.log(err)}

}

fetchRouterInfo(
    "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
    "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
    "1"
)


router.get("/", async (req, res) => {
    const tokenA = req.query.tokenA
    const tokenB = req.query.tokenB
    const amount = req.query.amount

    try {
        const data = await fetchRouterInfo(
            tokenA,
            tokenB,
            amount
        )
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "X-Requested-With");
        res.json(data)
    } catch (err) {console.log(err)}
})

module.exports = [
    router
]