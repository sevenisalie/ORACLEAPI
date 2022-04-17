const express = require("express")
const router = express.Router()
const {addresses} = require("../utils/addresses.js")
const {pools} = require("../utils/pools")
const {ethers} = require("ethers")
const axios = require("axios")

const BigNumber = require("bignumber.js");
const { ERC20Abi, UniPairAbi, quickSwapFactoryAbi } = require("../utils/abi.js")
const masterchef = require("../artifacts/contracts/MasterChefV2.sol/MasterChefV2.json")
const MasterchefAbi = masterchef.abi

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
    // console.log(`loaded contract ${contract.address}`);
    return contract;
};

const fetchMasterChef = async () => {
    const ctr = fetchContract(addresses.CHEF.masterChef, MasterchefAbi)
    return ctr
}

const fetchPoolData = async (_poolId, _chef) => {
    const STATICPOOLDATA = pools[_poolId] //imported from ../utils/pools

    const poolInfo =  _chef.poolInfo(_poolId)
    const totalAllocPoints =  _chef.totalAllocPoint()
    const cobPerBlock =  _chef.cobPerBlock()
    const poolLength =  _chef.poolLength()
    const promises = [poolInfo, totalAllocPoints, cobPerBlock, poolLength]
    const [
        _poolInfo,
        _totalAllocPoints,
        _cobPerBlock,
        _poolLength
    ] = await Promise.all(promises)

    const formattedCPB = parseFloat(ethers.utils.formatUnits(_cobPerBlock, 18))
    const depositToken = _poolInfo.lpToken
    const allocPoints = parseFloat(ethers.utils.formatUnits(_poolInfo.allocPoint, 0))
    const accCobPerShare = parseFloat(ethers.utils.formatUnits(_poolInfo.accCobPerShare, 18))
    const depositFeePercent = (1 - (_poolInfo.depositFeeBP / 10000)) * 100
    const poolRewardPerBlock = formattedCPB * (allocPoints/_totalAllocPoints)

    const _depositTokenInfo =  getTokenInfo(depositToken)
    const _earnTokenInfo =  getTokenInfo(pools[_poolId].tokenEarnAddress)
    const _tokenStakePriceInfo =  fetchBestLP(STATICPOOLDATA.tokenBaseAddress)
    const _tokenEarnPriceInfo =  fetchBestLP(STATICPOOLDATA.tokenEarnAddress)
    const promises2 = [_depositTokenInfo, _earnTokenInfo, _tokenStakePriceInfo, _tokenEarnPriceInfo]
    const [depositTokenInfo, earnTokenInfo, tokenStakePriceInfo, tokenEarnPriceInfo] = await Promise.all(promises2)
    // const lpInfo = await fetchRankedLiquidity(d)

    


    return {
        PID: _poolId,
        PoolCount: parseInt(ethers.utils.formatUnits(_poolLength, 0)),
        DepositToken: {
            ...depositTokenInfo,
            base: STATICPOOLDATA.tokenBaseAddress,
            isLP: STATICPOOLDATA.LP,
            logo: STATICPOOLDATA.tokenStakeLogoName,
            price: {
                ...tokenStakePriceInfo
            }

        },
        EarnToken: {
            ...earnTokenInfo,
            logo: STATICPOOLDATA.tokenEarnLogoName,
            price: {
                ...tokenEarnPriceInfo
            }
        },
        CobPerBlock: formattedCPB,
        DepositFeePercent: depositFeePercent,
        PoolCobPerBlock: poolRewardPerBlock,
    }
}

const getTokenInfo = async (_stakedTokenAddress) => {
    
    const stakeTokenAddress = _stakedTokenAddress
    const tokenctr = await fetchContract(stakeTokenAddress, ERC20Abi)

    const tokenDecimals =  tokenctr.decimals()
    const tokenSymbol =  tokenctr.symbol()
    const stakedAmount =  tokenctr.balanceOf(addresses.CHEF.masterChef)

    const promises = [
        tokenDecimals,
        tokenSymbol,
        stakedAmount
    ]

    const [
        _tokenDecimals,
        _tokenSymbol,
        _stakedAmount 
    ] = await Promise.all(promises)

    BigNumber.config({ EXPONENTIAL_AT: 10 })

    const formattedStakedAmount = parseFloat(ethers.utils.formatUnits(_stakedAmount, _tokenDecimals))
    const bnStakedAmount = new BigNumber(formattedStakedAmount)

    const data = {
        address: _stakedTokenAddress,
        decimals: _tokenDecimals,
        symbol: _tokenSymbol,
        amountStaked: bnStakedAmount.toPrecision()
    }

    return data
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
  
    
              if (_token.toLowerCase() == token0.toLowerCase()) {
                const pairInfo = await fetchLPInfo(pairAddress)
                const token1To_tokenPrice = new BigNumber(pairInfo.token1.priceRatio)
                const MaticToToken1Price = await getMaticPriceRatio(token1)
                const derived = token1To_tokenPrice.multipliedBy(MaticToToken1Price)

                return {
                    ...pairInfo,
                    DerivedMaticPrice: derived.toPrecision()
                }

              }
              if (_token.toLowerCase() == token1.toLowerCase()){
                const pairInfo = await fetchLPInfo(pairAddress)

                const token0To_tokenPrice = new BigNumber(pairInfo.token0.priceRatio)
                const MaticToToken0Price = await getMaticPriceRatio(token0)
                const derived = token0To_tokenPrice.multipliedBy(MaticToToken0Price)
                    
                  // token0/_token * MATIC/token0 //derived rpice
         
                return {
                    ...pairInfo,
                    DerivedMaticPrice: derived.toPrecision()
                }

              }
          }
      })
  
  
      const raw = await Promise.all(quoteTokenMap)
      const data = raw.filter( (item) => {
          return item !== undefined
      })
  
  
      return data
}

const getMaticPriceRatio = async (_token) => {
    const MATIC = addresses.tokens.MATIC
    if (_token.toLowerCase() == MATIC.toLowerCase()) {
        console.log("both token and quote token are the same")
        return 1
    }

    const factory = await fetchContract(addresses.FACTORY, quickSwapFactoryAbi)

    
    const pairAddress = await factory.getPair(_token, MATIC)
    const lpctr = await fetchContract(pairAddress, UniPairAbi)
    const tokens = [_token, MATIC]
    

    const _token0 =  lpctr.token0()
    const _token1 =  lpctr.token1()
    const _reserves =  lpctr.getReserves()

    const batch1 = [_token0, _token1, _reserves]
    const [
        token0,
        token1,
        reserves
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

    if (token0.toLowerCase() == _token.toLowerCase()) {
        const token1Price = bnToken1Reserves.div(bnToken0Reserves)
        return token1Price
    }
    if (token1.toLowerCase() == _token.toLowerCase()) {
        const token0Price = bnToken0Reserves.div(bnToken1Reserves)
        return token0Price
    }


}

const fetchBestLP = async (_token) => {
    try {
        const data = await fetchTokenLiquidityInfo(_token)
    const nativeTokenLiquidity = data.map( (pool) => {
        const token0 = pool.token0
        const token1 = pool.token1
        if (token1.address.toLowerCase() == _token.toLowerCase()) {
            return token1.reserves
        }
        if (token0.address.toLowerCase() == _token.toLowerCase()) {
            return token0.reserves
        }
    
    })

    const nums = nativeTokenLiquidity.map( (item) => {
        const data = parseFloat(item)
        return data
    })
    const max = Math.max.apply(null, nums)

    const maxLP = data.filter( (pool) => {
        return parseFloat(pool.token0.reserves) == max || parseFloat(pool.token1.reserves) == max
    })

    
    return maxLP[0]
    } catch (err) {return 1}
    
}

const fetchRankedLiquidity = async (_token) => {
    const LPInfo = await fetchTokenLiquidityInfo(_token)

    const rankedTokenLiquidity = LPInfo.sort( (a,b) => {
        if (a.token0.address.toLowerCase() == _token.toLowerCase()) {
            return a.token0.reserves - b.token0.reserves
        }
        if (a.token1.address.toLowerCase() == _token.toLowerCase()) {
            return a.token1.reserves - b.token1.reserves
        }
       
    })
    
    return rankedTokenLiquidity
}

const fetchAllowances = async (_user) => {

    

    const tokens = pools.map( pool => { 
        return {
            address: pool.tokenStakeAddress,
            decimals: pool.decimals
        } 
    })

    const allowancePromises = tokens.map( async (token) => {
        const ctr = await fetchContract(token.address, ERC20Abi)
        const ttl =  ctr.allowance(_user, addresses.CHEF.masterChef)
        return ttl
    })

    const results = await Promise.all(allowancePromises)

    const allowances = results.map( (result) => {
        const data = ethers.utils.formatUnits(result, 0)
        if (data == "0") {
            return false
        }
        else {
            return true
        }
        
    })

    return allowances

}

const getAPY = async (_poolTVL, _tokenPerBlock) => {

    const reward = await fetchBestLP(addresses.tokens.COB) 
    const rwrd = reward.DerivedMaticPrice
    const TVL = new BigNumber(_poolTVL)
    const rewardPrice = new BigNumber(rwrd)
    const tokenPB = new BigNumber(_tokenPerBlock)
    const BPY = new BigNumber(15768000) //2s avg

    const rewardPerYear = rewardPrice.multipliedBy(tokenPB).multipliedBy(BPY)
    const APY = rewardPerYear.dividedBy(TVL).multipliedBy(100)
    return APY.toPrecision()
}


// $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
// $$$$$$$$$ CORE    $$$$$$$$$$$$$$$$$$
// $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$

const fetchAllUserPoolData = async (_userAddress) => {
    const _pools = pools.map( (pool) => {
        return {
            address: pool.tokenStakeAddress,
            isLP: pool.LP
        }
    })

    
    const promises = _pools.map( (pool) => {
        if (pool.isLP == true) {
            const LPData = fetchUserLPData(pool.address, _userAddress)
            return LPData
        } else if (pool.isLP == false) {
            const tokenData = fetchUserTokenData(pool.address, _userAddress)
            return tokenData
        }
        
    })
    
    const data = await Promise.all(promises)
    return data
}

const fetchAllPoolData = async () => {
    const chef = await fetchMasterChef()
    const poolLength =  await chef.poolLength()

    const pids = []
    for (let pid = 0; pid < poolLength; pid++) {
        pids.push(pid)
    }

    const promises = pids.map( (pid) => {
        return fetchPoolData(pid, chef)
    })

    const data = await Promise.all(promises)
    return data
}



const fetchUserLPData = async (_token, _userAddress) => {
    const POOL = pools.filter( (pool) => {
        return pool.tokenStakeAddress.toLowerCase() == _token.toLowerCase()
    }) //imported from ../utils/pools

    const _poolId = POOL[0].pid
    const _rewardTokenPerBlock = POOL[0].cobPerBlock
    const chefctr = await fetchContract(addresses.CHEF.masterChef, MasterchefAbi)
    const pairctr = await fetchContract(_token, UniPairAbi)
    const allowances = await fetchAllowances(_userAddress)

    const allowance = allowances[_poolId]

    if (_userAddress.toLowerCase() !== addresses.CHEF.masterChef.toLowerCase()) {
        const userInfo = await chefctr.userInfo(_poolId, _userAddress)
        const pairInfo = await pairctr.totalSupply()
        const token0 = await pairctr.token0()
        const token1 = await pairctr.token1()


        const token0ctr = await fetchContract(token0, ERC20Abi)
        const token1ctr = await fetchContract(token1, ERC20Abi)
        const token1Decimals = await token1ctr.decimals()
        const token0Decimals = await token0ctr.decimals()
    

     
        const rawTVL = await pairctr.balanceOf(addresses.CHEF.masterChef)
        const poolTotalStaked = ethers.utils.formatUnits(rawTVL, 6)



   
        const stakedAmount = ethers.utils.formatUnits(userInfo.amount, 6)
        
        
     
     
        const data = {
            USER: {
                poolStakedAmount: poolTotalStaked,
                stakedAmount: stakedAmount,
                allowance: allowance,
            }
        }
        
        return data
    } else {
        return "trying to read masterchef itself yo"
    }
}

const fetchUserTokenData = async (_token, _userAddress) => {
    const POOL = pools.filter( (pool) => {
        return pool.tokenStakeAddress.toLowerCase() == _token.toLowerCase()
    }) //imported from ../utils/pools
    console.log("TARGET ACWUIRED")
    console.log(POOL)
    let _poolId;
    let _rewardTokenPerBlock;
    if (POOL[0] !== undefined) {
        _poolId = POOL[0].pid
        _rewardTokenPerBlock = POOL[0].cobPerBlock
    } else {
        _poolId = 1 //just return a ppol for calcs sake
        _rewardTokenPerBlock = 0
    }
    
    // Act I the token
    const tokenctr = await fetchContract(_token, ERC20Abi)

    const decimals = POOL[0].decimals
    const totalSupply = await tokenctr.totalSupply()
    const formattedTotalSupply = ethers.utils.formatUnits(totalSupply, decimals)
    const rawTVL = await tokenctr.balanceOf(addresses.CHEF.masterChef)
    const poolTotalStaked = ethers.utils.formatUnits(rawTVL, decimals)


    
    

    //act II masterchef cooks some nums
    
    const chefctr = await fetchContract(addresses.CHEF.masterChef, MasterchefAbi)

    const userInfo = await chefctr.userInfo(_poolId, _userAddress)
    const _stakedAmount = ethers.utils.formatUnits(userInfo.amount, decimals)
    const allowances = await fetchAllowances(_userAddress)

    const allowance = allowances[_poolId]


    //incoming Math lolz
    BigNumber.config({ EXPONENTIAL_AT: 10 })

        //token ratio
    

        //token value
   

        //pool TVL in Matic

 


    

    const data = {
        USER: {
            poolStakedAmount: poolTotalStaked,
            stakedAmount: _stakedAmount,
            allowance: allowance,
        }
      }
    
    return data
}
// $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
// $$$$$$$$$ ENDPOINTS    $$$$$$$$$$$$$
// $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$


router.get('/poolData', async (req, res) => {
    try {
        const data = await fetchAllPoolData()
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "X-Requested-With");
        res.json(data)
        
    } catch (err) {
        res.json(err)
        res.status(500)
    }
})

router.get('/userPoolData/:userAddress', async (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    const userAddress = req.params.userAddress
    try {
        const data = await fetchAllUserPoolData(userAddress)
        res.json(data)
    } catch (err) {
        res.status(500)
        res.json(err)
    }
})




module.exports = [
    router
]




