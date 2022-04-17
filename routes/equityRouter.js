const express = require("express")
const router = express.Router()
const {aggregatorV3InterfaceABI, UniPairAbi, ERC20Abi, quickSwapFactoryAbi, stopLossVaultABI, settingsABI, quickSwapRouterABI} = require("../utils/abi.js")
const {addresses} = require("../utils/addresses.js")
const {ethers} = require("ethers")
const axios = require("axios")
const StopLossVault = require("../build/contracts/StopLossVault.json")
const Controller = require("../build/contracts/Controller.json")
const TOKENLIST = require("../utils/TOKENLIST.json")
const BigNumber = require("bignumber.js");


require('dotenv').config()

const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
// $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
// $$$$$$$$$ HELPERS $$$$$$$$$$$$$$$$$$
// $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$

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
};

// $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
// $$$$$$$$$ CORE $$$$$$$$$$$$$$$$$$$$$
// $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$


const getBestSwapRate = async (_tokenA, _tokenB) => {
    const WHITELIST = [
        addresses.tokens.MATIC, // MATIC
        addresses.tokens.DAI, // DAI
        addresses.tokens.USDT, // USDT
        addresses.tokens.USDC, // USDC
        addresses.tokens.MiMATIC, // MAI
        addresses.tokens.BTC, // BTC
        addresses.tokens.ETH, // WETH
      ]



    const tokenA = TOKENLIST.tokens.filter( (token) => {
        return token.address.toLowerCase() == _tokenA.toLowerCase()
        }) //imported from ../utils/pools

    const tokenB = TOKENLIST.tokens.filter( (token) => {
        return token.address.toLowerCase() == _tokenB.toLowerCase()
        }) //imported from ../utils/pools

    if (tokenA[0] == undefined) {
        return "Token In Not Whitelisted"
    }
    if (tokenB[0] == undefined) {
        return "Token Out Not Whitelisted"
    }
    
      const ctr = await fetchContract(addresses.ROUTER, quickSwapRouterABI)
      const oneA = ethers.utils.parseUnits("1", tokenA[0].decimals)
      const oneB = ethers.utils.parseUnits("1", tokenB[0].decimals)
    

    
    const ratePromises = WHITELIST.map( async (quoteToken) => {
        try {
        const rateAB =  await ctr.getAmountsOut(oneA, [tokenA[0].address, quoteToken, tokenB[0].address])
        const rateBA = await ctr.getAmountsOut(oneB, [tokenB[0].address, quoteToken, tokenA[0].address])
        return {
            quoteToken,
            rateAB,
            rateBA
        }
        } catch (err) {console.log(`No LP for ${quoteToken}`)}
    })
    
    const rawRates = await Promise.all(ratePromises)

    const rates = rawRates.filter( (item) => {
        return item !== undefined //remove nonexistent LPs
    })

    const ratesMap = rates.map( (rate) => {
        const amountBPerOneA = ethers.utils.formatUnits(rate.rateAB[2], tokenB[0].decimals)
        const amountAPerOneB = ethers.utils.formatUnits(rate.rateBA[2], tokenA[0].decimals)
        return {
            pathAB: [_tokenA, rate.quoteToken, _tokenB],
            BPerA: amountBPerOneA,
            pathBA: [_tokenB, rate.quoteToken, _tokenA],
            APerB: amountAPerOneB
        }
        
    })

    const rankedPriceAB = ratesMap.sort( (a,b) => {
        
            return parseFloat(b.BPerA) - parseFloat(a.BPerA)     
    })

    const rankedPriceBA = ratesMap.sort( (a,b) => {
        
        return parseFloat(b.APerB) - parseFloat(a.APerB)     
    })

    return {
        BPerA: rankedPriceAB[0].BPerA,
        APerB: rankedPriceBA[0].APerB
    }

}

// $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
// $$$$$$$$$ ENDPOINTS $$$$$$$$$$$$$$$$
// $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$

router.get( "/", async (req, res) => {

    const tokenA = req.query.tokenA
    const tokenB = req.query.tokenB
    try {
        const data = await getBestSwapRate(tokenA, tokenB);
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "X-Requested-With");
        res.json(data)
    } catch (err) {
        res.status(500).json({ message: `${err}`})
    }
})

module.exports = [
    router
]