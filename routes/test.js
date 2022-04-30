const {aggregatorV3InterfaceABI, UniPairAbi, ERC20Abi, quickSwapFactoryAbi, stopLossVaultABI, settingsABI, quickSwapRouterABI} = require("../utils/abi.js")
const {addresses} = require("../utils/addresses.js")
const {ethers} = require("ethers")
const axios = require("axios")
const StopLossVault = require("../build/contracts/StopLossVault.json")
const Controller = require("../build/contracts/Controller.json")
const TOKENLIST = require("../utils/TOKENLIST.json")
const BigNumber = require("bignumber.js");
const { Contract, Provider } = require('ethers-multicall');
const MULTICALL = require("../build/contracts/Multicall.json")
const {pools} = require("../utils/pools")
const MASTERCHEF = require("../artifacts/contracts/MasterChefV2.sol/MasterChefV2.json")

require('dotenv').config()

// const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
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


const fetchPriceFeed = async (priceFeedAddress) => {
    const ctr = await fetchContract(priceFeedAddress, aggregatorV3InterfaceABI, provider)
    return ctr
}

const getPrice = async () => {
    const ctr = await fetchPriceFeed(addresses["ETH"])
    const price = await ctr.latestRoundData()
    return price
}

const mapPriceData = async (priceData) => {
  
        console.log(priceData.roundId)
        const id = ethers.utils.formatUnits(priceData.roundId, 0)
        const answer = ethers.utils.formatUnits(priceData.answer, 8)
        
        const timestamp = ethers.utils.formatUnits(priceData.updatedAt, 0)
        let d = Date(timestamp*1000);
        d = JSON.stringify(d)
        return {
            ID: id,
            time: d,
            price: answer
        }
  
}

const getNFTs = async () => {
    const data = await axios.get("https://cornoracleapi.herokuapp.com/stoploss/nfts/0x395977E98105A96328357f847Edc75333015b8f4")
    const darta = data.data
    return darta
}

const getTokenSymbol = async (tokenAddress) => {
    try {
        const ctr = await fetchContract(tokenAddress, ERC20Abi)
        const sym = await ctr.symbol()
        return sym
    } catch (err) {
        if (tokenAddress.toLowerCase() == addresses.USDC.toLowerCase())  {
            let name = "USDC"
            return name
        } else if (tokenAddress.toLowerCase() == addresses.USDT.toLowerCase()) {
            let name = "USDT"
            return name
        } else if (tokenAddress.toLowerCase() == addresses.BTC.toLowerCase()) {
            let name = "BTC"
            return name
        } else if (tokenAddress.toLowerCase() == addresses.ETH.toLowerCase()) {
            let name = "ETH"
            return name
        } else if (tokenAddress.toLowerCase() == addresses.MATIC.toLowerCase()) {
            let name = "MATIC"
            return name
        } else if (tokenAddress.toLowerCase() == addresses.DAI.toLowerCase()) {
            let name = "DAI"
            return name
        } else {
            let msg = "Symbol Not in Whitelist"
            console.log(err)
            return msg
        }
    }
}

const getTokenDecimals = async (token) => {
    const ctr = await fetchContract(token, ERC20Abi)
    const decimals = await ctr.decimals()
    return decimals
}

const bigNumberToString = async (bignum, dec) => {
    const cleaned = ethers.utils.formatUnits(bignum, dec)
    return cleaned
}

const viewSettings = async () => {
    const ctr =  await fetchContract(addresses.SETTINGS, settingsABI)
    
    const one =  ctr.lendingPool()
    const two =  ctr.rewards()
    const three =  ctr.aaveMarketTokens()
    const four = ctr.feePoints()
    const five = ctr.feeBasePoints()
    const six = ctr.maxFeePercent()
    const promises =[one, two, three, four, five, six]

    const [
        lender,
        rewards,
        AMTokens,
        feePoints,
        basisPoints,
        maxFeePercent
    ] = await Promise.all(promises)

    const feeNum = parseFloat(await bigNumberToString(feePoints, 0))
    const basisPointsNum = parseFloat(await bigNumberToString(basisPoints, 0))
    const maxFeePercentNum = parseFloat(await bigNumberToString(maxFeePercent, 0))
    const feeAsPercent = ((feeNum / basisPointsNum) * 100 )
    const data = {
        lendingpool: lender,
        reward: rewards,
        aavetokens: AMTokens,
        feepoints: feeNum,
        basis: basisPointsNum,
        maxfeepoints: maxFeePercentNum,
        feepercent: feeAsPercent
    }

    return data
}


const readUserTrade = async (tokenId, orderIdsArray) => {
    const url = `https://cornoracleapi.herokuapp.com/stoploss/userTrades/${tokenId}&[${orderIdsArray}]`
    const call = await axios.get(url)
    return call.data
}

const getSwapInfo = async (tokenA, tokenADecimals, tokenB, tokenBDecimals) => {
    const ctr = await fetchContract(addresses.ROUTER, quickSwapRouterABI)

    const oneA = ethers.utils.parseUnits("1", tokenADecimals)
    const oneB = ethers.utils.parseUnits("1", tokenBDecimals)
    const rateAB = await ctr.getAmountsOut(oneA, [tokenA, addresses.tokens.ETH, tokenB])
    const rateBA = await ctr.getAmountsOut(oneB, [tokenB, addresses.tokens.ETH, tokenA])

    const amountBPerOneA = ethers.utils.formatUnits(rateAB[2], 6)
    const amountAPerOneB = ethers.utils.formatUnits(rateBA[2], 8)
    return {
        BPerA: amountBPerOneA,
        APerB: amountAPerOneB
    }
}

//#stopLoss.createTrade(dev.address, [token2, token1], [0.01e18, 0.00027027027027e8], [0])
const createTrade = async (to, tokenIn, tokenOut, amountIn, priceOut, _times) => {
    const signer = await fetchSigner()
    const path = [tokenIn, tokenOut]
    const amounts = [amountIn, priceOut]
    const times = [_times]
    const ctr_read = await fetchContract(addresses.STOPLOSSVAULT, stopLossVaultABI)
    const ctr = ctr_read.connect(signer)
    try {const call = await ctr.createTrade(
        to,
        path,
        amounts,
        times
        )
        return call
    } catch (err) {console.log(err)}
}//works

const approveVault = async (tokenAddress, vaultAddress) => {
    const signer = await fetchSigner()
    const tokenCtr = await fetchContract(tokenAddress, ERC20Abi)
    const ctr = tokenCtr.connect(signer)

    try {
        const approve = await ctr.approve(vaultAddress, ethers.constants.MaxUint256)
        return approve
    } catch (err) {console.log(err)}

    
}


const createStopLossTrade = async (to, tokenIn, tokenInDecimals, tokenOut, amountIn, priceOut, _stopLossContract) => {
    const path = [tokenIn, tokenOut]
    const bigNumAmountIn = ethers.utils.parseUnits(amountIn, tokenInDecimals)
    const numerator = ethers.utils.parseUnits("1", 8)
    const denominator = ethers.utils.parseUnits(priceOut, 8)
    const a = ethers.BigNumber.from(numerator)
    const b = ethers.BigNumber.from(denominator)
    const ab = a.div(b)

    const bigNumPriceOut = numerator.div(denominator)
    const amounts = [bigNumAmountIn, bigNumPriceOut]
    const out = ethers.utils.formatUnits(ab, 8)
    const times = [0]
    
    const ctr = _stopLossContract
    console.log(`
        binumIn: ${bigNumAmountIn}
        numerator: ${numerator}
        denominator; ${denominator}
        result: ${ab}
    `)
    // try {
    //     const mint = await ctr.createTrade(
    //     to,
    //     path,
    //     amounts,
    //     times
    //     )
    //     return mint
    // } catch (err) {console.log(err)}
}
// $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
// $$$$$$$$$ Post Controller Life $$$$$$$$$
// $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
// fetch for get, view for clean baaaby

const fetchVaultTokensByOwner = async (address) => {
    const ctr = await fetchContract(addresses.vaults.controller, Controller.abi)
    // const ctr = ctr_read.connect(signer)

    const userTrades = await ctr.vaultTokensByOwner(address)

    const mappedData = userTrades.map( (trade) => {
        let _vault;
        if (trade.vault == addresses.vaults.limitVault) {
            _vault = "Limit"
        } else if (trade.vault == addresses.vaults.stopVault) {
            _vault = "Stop"
        } else if (trade.vault == addresses.vaults.accDistVault) {
            _vault = "Accumulator Distributor"
        }

        return {
            id: ethers.utils.formatUnits(trade.tokenId, 0),
            vault: _vault,
            vaultAddress: trade.vault
        }
    } )

    return mappedData
}

const fetchTrades = async (vaultId, tokenId) => {
    const ctr = await fetchContract(addresses.vaults.controller, Controller.abi)
    // const ctr = ctr_read.connect(signer)

    const rawTrades = await ctr.viewTrades(vaultId, tokenId, [0])
    const trades = rawTrades[0]
    const mappedData = trades.map( (trade) => {
        const _amounts = []
        const mappedAmounts = trade.amounts.map( (amount) => {
            const int = ethers.utils.formatUnits(amount, 0)
            _amounts.push(int)
        })
        return {
            tokenId: ethers.utils.formatUnits(trade.tokenId, 0),
            tradeId: ethers.utils.formatUnits(trade.tradeId, 0),
            timestamp: ethers.utils.formatUnits(trade.timestamp, 0),
            tokens: trade.tokens,
            amounts: _amounts


        }
    })

    return mappedData
}

const fetchOpenOrdersLength = async (vaultId) => {
    const ctr = await fetchContract(addresses.vaults.controller, Controller.abi)
    // const ctr = ctr_read.connect(signer)
    const rawLength = await ctr.openOrdersLength(vaultId)
    const length = parseInt(ethers.utils.formatUnits(rawLength, 0))
    return length
}

const fetchOpenOrders = async (vaultId) => {
    const ctr = await fetchContract(addresses.vaults.controller, Controller.abi)
    // const ctr = ctr_read.connect(signer)
    const end = await fetchOpenOrdersLength(0)
    const rawOrders = await ctr.viewOpenOrdersInRange(0, 0, (end - 1))

    const mappedData = rawOrders.map( (order) => {
        const _amounts = []
        const mappedAmounts = order.amounts.map( (amount) => {
            const int = parseInt(ethers.utils.formatUnits(amount, 0))
            _amounts.push(int)
        })
        const fromAmount = parseInt(ethers.utils.formatUnits(amounts[0], 0))
        const toAmount = parseInt(ethers.utils.formatUnits(amounts[1], 0))
        const limitAmount = parseInt(ethers.utils.formatUnits(amounts[2], 0))

        return {
            tokenId: parseInt(ethers.utils.formatUnits(order.tokenId, 0)),
            tradeId: parseInt(ethers.utils.formatUnits(order.tradeId, 0)),
            timestamp: parseInt(ethers.utils.formatUnits(order.timestamp, 0)),
            tokens: order.tokens,
            amounts: _amounts


        }
    })

    return mappedData
}

const fetchSettings = async () => {
    const ctr =  await fetchContract(addresses.vaults.settings, Settings.abi)
    
    const one =  ctr.lendingPool()
    const two =  ctr.rewards()
    const three =  ctr.aaveMarketTokens()
    const four = ctr.feePoints()
    const five = ctr.feeBasePoints()
    const six = ctr.maxFeePercent()
    const promises =[one, two, three, four, five, six]

    const [
        lender,
        rewards,
        AMTokens,
        feePoints,
        basisPoints,
        maxFeePercent
    ] = await Promise.all(promises)

    const feeNum = parseFloat(await bigNumberToString(feePoints, 0))
    const basisPointsNum = parseFloat(await bigNumberToString(basisPoints, 0))
    const maxFeePercentNum = parseFloat(await bigNumberToString(maxFeePercent, 0))
    const feeAsPercent = ((feeNum / basisPointsNum) * 100 )
    const data = {
        lendingpool: lender,
        reward: rewards,
        aavetokens: AMTokens,
        feepoints: feeNum,
        basis: basisPointsNum,
        maxfeepoints: maxFeePercentNum,
        feepercent: feeAsPercent
    }

    return data
}

const getUserTrades = async (nftIds, _vaultMode) => {
    const vaultSwitch = {
        0: "limit",
        1: "stop",
        2: "accumulatordistributor"
    }
    const tradePromises = nftIds.map( async (id) => {
        const resp = await axios.get(`https://cornoracleapi.herokuapp.com/${vaultSwitch[_vaultMode]}/trades/${id}`)
        const raw = resp.data
        return raw 
    })

    const trades = await Promise.all(tradePromises)
    return trades
}

const getTokenList = async () => {
    const url = `https://unpkg.com/quickswap-default-token-list@1.0.91/build/quickswap-default.tokenlist.json`
    const tokenList = await axios.get(url)
    return tokenList.data
}


const fetchLPInfo = async (LPTokenAddress) => {
    const lpctr = await fetchContract(LPTokenAddress, UniPairAbi)
    

    const _token0 =  lpctr.token0()
    const _token1 =  lpctr.token1()
    const _reserves =  lpctr.getReserves()
    const _totalSupply = lpctr.totalSupply()

    const batch1 = [_token0, _token1, _reserves, _totalSupply]
    const [
        token0,
        token1,
        reserves,
        totalSupply
    ] = await Promise.all(batch1)

    const _token0ctr = await fetchContract(token0, ERC20Abi)
    const _token1ctr = await fetchContract(token1, ERC20Abi)

    const _token0Decimals =  _token0ctr.decimals()
    const _token0Symbol =  _token0ctr.symbol()

    const _token1Decimals =  _token1ctr.decimals()
    const _token1Symbol =  _token1ctr.symbol()

    const batch2 = [_token0Decimals, _token0Symbol, _token1Decimals, _token1Symbol]
    const [
        token0Decimals,
        token0Symbol,
        token1Decimals,
        token1Symbol

    ] = await Promise.all(batch2)



    const token0Reserves = ethers.utils.formatUnits(reserves._reserve0, token0Decimals)
    const token1Reserves = ethers.utils.formatUnits(reserves._reserve1, token1Decimals)
    const bnToken0Reserves = new BigNumber(token0Reserves)
    const bnToken1Reserves = new BigNumber(token1Reserves)

    const token0Price = bnToken0Reserves.div(bnToken1Reserves).toPrecision()
    const token1Price = bnToken1Reserves.div(bnToken0Reserves).toPrecision()
    const formattedTotalSupply = ethers.utils.formatUnits(totalSupply, 18)
    


    const data = {
        LPTotalSupply: formattedTotalSupply,
        token0: {
            address: token0,
            symbol: token0Symbol,
            reserves: token0Reserves,
            decimals: token0Decimals,
            priceRatio: token0Price,

        },
        token1: {
            address: token1,
            symbol: token1Symbol,
            reserves: token1Reserves,
            decimals: token1Decimals,
            priceRatio: token1Price,


        }
    }

    return data
}


const fetchTokenLiquidityInfo = async (_token) => {

    const WHITELIST = [
        addresses.tokens.MATIC, // MATIC
        addresses.tokens.DAI, // DAI
        addresses.tokens.USDT, // USDT
        addresses.tokens.USDC, // USDC
        addresses.tokens.MiMATIC, // MAI
        addresses.tokens.BTC, // BTC
        addresses.tokens.ETH, // WETH
      ]

      const factoryctr = await fetchContract(addresses.FACTORY, quickSwapFactoryAbi)

      
  
      const quoteToken = addresses.tokens.MATIC
      
      if (_token.toLowerCase() == quoteToken.toLowerCase()) {
          console.log("both token and quote token are the same")
          return 1
      }
  
      //work it
      const quoteTokenMap = WHITELIST.map( async (quoteToken) => {
          const pairAddress = await factoryctr.getPair(_token, quoteToken)
  
          if (pairAddress.toLowerCase() !== addresses.ZERO_ADDRESS.toLowerCase()) {
              const pairctr = await fetchContract(pairAddress, UniPairAbi)
              const token0 = await pairctr.token0()
              const token1 = await pairctr.token1()
  
              let token0PairPromises = []
              if (_token.toLowerCase() == token0.toLowerCase()) {
                const pairInfo = fetchLPInfo(pairAddress)

                token0PairPromises.push(pairInfo)
              }
              let token1PairPromises = []
              if (_token.toLowerCase() == token1.toLowerCase()){
                const pairInfo = fetchLPInfo(pairAddress)
                  // token0/_token * MATIC/token0 //derived rpice
                  token1PairPromises.push(pairInfo)
              }

              const token0Pairs = await Promise.all(token0PairPromises)
              const token1Pairs = await Promise.all(token1PairPromises)
              return {
                  ...token0Pairs,
                  ...token1Pairs
              }
          }
      })
  
  
      const raw = await Promise.all(quoteTokenMap)
      const data = raw.filter( (item) => {
          return item !== undefined
      })
  
  
      return data
}

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

const mapCalls = async (address, abi, ) => {
    const masterChef = new Contract(
        addresses.CHEF.masterChef,
        MASTERCHEF.abi
    )

    const pendingCalls = pools.map( pool => 
        masterChef.pendingCob(pool.pid, "0x395977E98105A96328357f847Edc75333015b8f4")
    )
    return pendingCalls
}

const multiCalls = async (calls) => {
    const callProvider = new Provider(provider, 137)
    // await callProvider.init()

    const results = await callProvider.all(calls)

    const cleanedResults = results.map( (result) => {
        return ethers.utils.formatUnits(result, 18)
    })
    return cleanedResults

}

const main = async () => {
   

    // const data = await getBestSwapRate(addresses.tokens.MATIC, addresses.tokens.USDC)
    const data = await multiCalls()
    console.log(data)
    // const signer = await fetchSigner()
    // const cobctr = await fetchContract(addresses.tokens.COB, ERC20Abi)
    // const usdcctr = await fetchContract(addresses.tokens.USDC, ERC20Abi)
    // // const lpctr = await fetchContract(addresses.tokens.lp.COBUSDC, UniPairAbi)
    // // const ctr = ctr_read.connect(signer)
    // const totalSupply = await cobctr.totalSupply()
    // const numTotalSupply = parseFloat(ethers.utils.formatUnits(totalSupply, 18))

    // const tokenALpBalance = await cobctr.balanceOf(addresses.tokens.lp.COBUSDC)
    // const cobLpBalance = parseFloat(ethers.utils.formatUnits(tokenALpBalance, 18))

    // const tokenBLpBalance = await usdcctr.balanceOf(addresses.tokens.lp.COBUSDC)
    // const UsdcLpBalance = parseFloat(ethers.utils.formatUnits(tokenBLpBalance, 6))

    // const tokenPriceVsQuote = new BigNumber(UsdcLpBalance).div(new BigNumber(cobLpBalance))
    // const mc = UsdcLpBalance / cobLpBalance 
    // console.log(cobLpBalance)
    // console.log(UsdcLpBalance)
    // BigNumber.config({ EXPONENTIAL_AT: 1e+9 })
    // console.log(tokenPriceVsQuote.toPrecision())

    // data = {
    //     supply: numTotalSupply,
    //     marketCap: tokenPriceVsQuote.toPrecision()

    // }
    // console.log(data)
    // // const settings = await readUserTrade(1, [0])
    // const to = "0x395977E98105A96328357f847Edc75333015b8f4"
    // const tokenIn = addresses.TESTTOKEN1
    // const tokenInDecimals = 18
    // const tokenOut = addresses.TESTTOKEN2
    // const amountIn = "1"
    // const priceOut = "110.4"
    // const times = 0

    // const trade = await createTrade(
    //     to,
    //     tokenIn,
    //     tokenOut,
    //     amountIn,
    //     priceOut,
    //     0
    // )
    // console.log(createTrade)

    // const data = await getSwapInfo(
    //     addresses.tokens.BTC,
    //     8,
    //     addresses.tokens.USDC,
    //     6
    // )
    // const stop = await createStopLossTrade(
    //     to,
    //     tokenIn,
    //     tokenInDecimals,
    //     tokenOut,
    //     amountIn,
    //     priceOut,
    //     ctr
    // )

}

main()