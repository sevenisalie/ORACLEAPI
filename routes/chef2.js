const express = require("express")
const router = express.Router()
const {addresses} = require("../utils/addresses.js")
const {pools} = require("../utils/pools")
const {ethers} = require("ethers")
const axios = require("axios")
const BigNumber = require("bignumber.js");
const {Contract} = require("ethers-multicall")

const {resolveCalls} = require("../utils/multiCalls")
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

const fetchMultiCallContract = async (address, abi) => {
    const contract = new Contract(address, abi)
    return contract
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




const fetchUserLPData = async (_token, _userAddress) => {
    const POOL = pools.filter( (pool) => {
        return pool.tokenStakeAddress.toLowerCase() == _token.toLowerCase()
    }) //imported from ../utils/pools

    const _poolId = POOL[0].pid
    const _rewardTokenPerBlock = POOL[0].cobPerBlock
    const chefctr = await fetchMultiCallContract(addresses.CHEF.masterChef, MasterchefAbi)
    const pairctr = await fetchMultiCallContract(_token, UniPairAbi)


    if (_userAddress.toLowerCase() !== addresses.CHEF.masterChef.toLowerCase()) {
        const _userInfo =  chefctr.userInfo(_poolId, _userAddress)
        const _pairInfo =  pairctr.totalSupply()
        const _token0 =  pairctr.token0()
        const _token1 =  pairctr.token1()
        const _rawTVL =  pairctr.balanceOf(addresses.CHEF.masterChef)

        const [
            userInfo,
            pairInfo,
            token0,
            token1,
            rawTVL
        ] = await resolveCalls([_userInfo, _pairInfo, _token0, _token1, _rawTVL])


        const poolTotalStaked = ethers.utils.formatUnits(rawTVL, 18)


        const stakedAmount = ethers.utils.formatUnits(userInfo.amount, 18)
        
    
        const data = {
            USER: {
                poolStakedAmount: poolTotalStaked,
                stakedAmount: stakedAmount,
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

    let _poolId;
    let _rewardTokenPerBlock;
    if (POOL[0] !== undefined) {
        _poolId = POOL[0].pid
        _rewardTokenPerBlock = POOL[0].cobPerBlock
    } else {
        _poolId = 1 //just return a ppol for calcs sake
        _rewardTokenPerBlock = 0
    }

    //Prologue: Fetchies
    const tokenctr = await fetchMultiCallContract(_token, ERC20Abi)
    const chefctr = await fetchMultiCallContract(addresses.CHEF.masterChef, MasterchefAbi)
    const _userInfo =  chefctr.userInfo(_poolId, _userAddress)
    const _totalSupply =  tokenctr.totalSupply()
    const _rawTVL =  tokenctr.balanceOf(addresses.CHEF.masterChef)

    const [
        userInfo,
        totalSupply,
        rawTVL
    ] = await resolveCalls([_userInfo, _totalSupply, _rawTVL])
    // Act I the token

    const decimals = POOL[0].decimals
    const formattedTotalSupply = ethers.utils.formatUnits(totalSupply, decimals)
    const poolTotalStaked = ethers.utils.formatUnits(rawTVL, decimals)

    //act II masterchef cooks some nums
    

    const _stakedAmount = ethers.utils.formatUnits(userInfo.amount, decimals)


    //incoming Math lolz
    BigNumber.config({ EXPONENTIAL_AT: 10 })

 
    const data = {
        USER: {
            poolStakedAmount: poolTotalStaked,
            stakedAmount: _stakedAmount,
        }
      }
    
    return data
}
// $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
// $$$$$$$$$ ENDPOINTS    $$$$$$$$$$$$$
// $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$



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




