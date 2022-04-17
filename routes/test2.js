const {aggregatorV3InterfaceABI, UniPairAbi, ERC20Abi, quickSwapFactoryAbi, stopLossVaultABI, settingsABI, quickSwapRouterABI} = require("../utils/abi.js")
const {addresses} = require("../utils/addresses.js")
const {ethers} = require("ethers")
const axios = require("axios")
const StopLossVault = require("../build/contracts/StopLossVault.json")
const MasterChef = require("../build/contracts/MasterChefV2.json")

const Controller = require("../build/contracts/Controller.json")
const TOKENLIST = require("../utils/TOKENLIST.json")
const BigNumber = require("bignumber.js");
require('dotenv').config()

const ADDRESSES = {
    masterChef: "0xDe388a7098674B459a98025b631C99d888d914C8",
    CobToken: "0x793AcF39c3d605d3aD042Ae01fd290a6fE489164",
    TestCob: "0xf8c631189f782Ff38538C80E42dC895a264F3a52",
    mockToken1: "0x7DBaFf79d13A0c842777742A86aE3aCAc9817250",
    mockToken2: "0xCCd1660797fe05dAe3439568aD39D2a4DacEab0e",
    mockLP: "0xea718C7dd15C6E1F98de3ED10f50d812e39E66D2",
}

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

const addPool = async (poolToken, ctr_write) => {
    const allocPoint = 50;
    const depositFeeBP = 10
    const withUpdate = true



    try { 
        const addPool = await ctr_write.add(
            allocPoint, 
            poolToken, 
            depositFeeBP, 
            withUpdate,
            {
                maxFeePerGas: ethers.utils.parseUnits("69", 9) ,
                maxPriorityFeePerGas: ethers.utils.parseUnits("69", 9),
            }
            )

        return addPool

    } catch (err) {console.log(err)}

}

const depositPool = async (poolId, amountIn, tokenDecimals, ctr_write) => {

    const _depositAmount = ethers.utils.parseUnits(amountIn, tokenDecimals)

    try {
        const deposit = await ctr_write.deposit(
            poolId,
            _depositAmount,
            {
                gasLimit: 1000000,
                maxFeePerGas: ethers.utils.parseUnits("69", 9),
                maxPriorityFeePerGas: ethers.utils.parseUnits("69", 9),
            })
        return deposit

     } catch (err) {console.log(err)}
}

const approveToken = async (token, token_ctr_write) => {
    try {
        const approve = await token_ctr_write.approve(
            token,
            ethers.constants.MaxUint256,
            {
                gasLimit: 1000000,
                gasPrice: ethers.utils.parseUnits("55", 9),

            }
        )
        return approve
    } catch (err) {console.log(err)}
}


const approval = async (spender, ctr) => {
    try {
        const tx = await ctr.approve(spender, ethers.constants.MaxUint256,
            {
                gasLimit: 1000000,
                gasPrice: ethers.utils.parseUnits("55", 9),

            }
            )
        const receipt = await tx.wait()
        return receipt
    } catch (err) {console.log(err)}
}

const main = async () => {
    const ctr = await fetchContract("0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", ERC20Abi)
    const signer = await fetchSigner()
    const ctr_write = ctr.connect(signer)
    const tranny = await approval("0xc8f4641b13ebf0280e8a5ee8adc4a0f65d86d1a6", ctr_write)
    console.log(tranny)

    // // const amountIn = "10"
    // // const poolId = 2
    // // const tokenDecimals = 18

    // const token_ctr = await fetchContract(addresses.CHEF.mockLP, ERC20Abi)
    // const token_ctr_write = token_ctr.connect(signer)
    // const poolLength = await ctr.poolLength()

    // const poolDataPromises = []
    // for (let i = 0; i < poolLength; i++) {
    //     const data = ctr.poolInfo(i)
    //     poolDataPromises.push(data)
    // }
    // const poolData = await Promise.all(poolDataPromises)

    // const cleanedPoolData = poolData.map( (pool, index) => {

    //     const depositFeePercent = parseFloat((pool.depositFeeBP / 10000 ) * 100)

    //     return {
    //         pid: index,
    //         tokenStakeAddress: pool.lpToken,
    //         tokenStakeName: "ALT1-ALT2",
    //         tokenStakeLogoName: "sushilogo",
    //         tokenEarnAddress: ADDRESSES.TestCob,
    //         tokenEarnName: "TESTCOB",
    //         tokenEarnLogoName: "cornlogo",
    //         multiplier: "2x",
    //         depositFee: depositFeePercent
    //     }
    // })

    // const pendingCob = ethers.utils.formatUnits(await ctr.pendingCob(2, signer.address), 18)
    // console.log(pendingCob)
    // console.log(cleanedPoolData)
    




    





  

   
}

main()