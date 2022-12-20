// Command-line utilities
import yargs from "yargs/yargs"
import { hideBin } from 'yargs/helpers'
import 'dotenv/config'

// Uniswap and Web3 modules
import { ethers } from "ethers";
import QuoterABI from '@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json'
import { FeeAmount, Pool, Route, Trade } from '@uniswap/v3-sdk/'
import { Pair } from '@uniswap/v2-sdk/'
import { TradeType, Token, CurrencyAmount, Percent } from '@uniswap/sdk-core'
import { AlphaRouter, LegacyRouter, SwapRoute } from '@uniswap/smart-order-router'
import { Protocol } from '@uniswap/router-sdk'
import IUniswapV3Pool from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json'
import IUniswapV3Factory from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json'
import { BigNumber } from '@ethersproject/bignumber';

const ERC20_ABI = [
    "function approve(address _spender, uint256 _value) public returns (bool success)",
    "function balanceOf(address _owner) public view returns (uint256 balance)",
    "function allowance(address _owner, address _spender) public view returns (uint256 remaining)",
    "function name() public view returns (string)",
    "function symbol() public view returns(string)",
    "function decimals() public view returns(uint8)",
    "function totalSupply() public view returns(uint256)",
    "function transfer(address _to, uint256 _value) public returns(bool success)",
    "function transferFrom(address _from, address _to, uint256 _value) public returns(bool success)",
]

async function main() {
    const chainId = 1;
    const walletAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // WETH addr
    const { API_URL, PRIVATE_KEY } = process.env;

    const provider = new ethers.providers.JsonRpcProvider(API_URL, chainId);

    const getToken = async function (contract: ethers.Contract): Promise<Token> {
        var [dec, symbol, name] = await Promise.all(
            [
                contract.decimals(),
                contract.symbol(),
                contract.name()
            ]);

        return new Token(chainId, contract.address, dec, symbol, name);
    }

    // MAINNET
    let tokenAddresses = [
        //"0x6B175474E89094C44Da98b954EedeAC495271d0F", 
        "0xdAC17F958D2ee523a2206206994597C13D831ec7",   // USDT
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",   // USDC
        "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",   // WBTC
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",   // WETH
        //"0xa31b1767e09f842ecfd4bc471fe44f830e3891aa", // ROOBEE
    ];


    var [amount, tokenInAddr, tokenOutAddr] = ["100",
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",   //  WETH 
        "0xdAC17F958D2ee523a2206206994597C13D831ec7"];  //  USDT

    // var [amount, tokenInAddr, tokenOutAddr] = ["1000000",
    //     "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",   //  WETH 
    //     "0xdAC17F958D2ee523a2206206994597C13D831ec7"];  //  USDT

    const width = 6;

    const [tokenIn, tokenOut] = await Promise.all([
        getToken(new ethers.Contract(tokenInAddr, ERC20_ABI, provider)),
        getToken(new ethers.Contract(tokenOutAddr, ERC20_ABI, provider))
    ]);

    console.log(`${amount} ${tokenIn.symbol?.padStart(width, " ")} ---> ${tokenOut.symbol?.padStart(width, " ")}:`);

    const amountIn = ethers.utils.parseUnits(amount, tokenIn.decimals);
    const inAmount = CurrencyAmount.fromRawAmount(tokenIn, amountIn.toString());

    const router = new AlphaRouter({ chainId: tokenIn.chainId, provider: provider });
    let route = await router.route(inAmount, tokenOut, TradeType.EXACT_INPUT,
        {
            recipient: walletAddress,
            slippageTolerance: new Percent(5, 100),
            deadline: Math.floor(Date.now() / 1000 + 1800)
        },
        //{ protocols: [Protocol.V2] }
    );

    printRoute("No limit for maxSplits", route, tokenOut);

    var route3 = await router.route(inAmount, tokenOut, TradeType.EXACT_INPUT,
        {
            recipient: walletAddress,
            slippageTolerance: new Percent(5, 100),
            deadline: Math.floor(Date.now() / 1000 + 1800)
        }, { protocols: [Protocol.V2], maxSplits: 1, maxSwapsPerPath: 1 }
    );

    printRoute("only V2, one split, one swap max", route3, tokenOut);
}

function getPathStr(tokens: Token[]): string {
    return tokens.map(el => el.symbol).join(" ");
}

function printRoute(caption: string, route: SwapRoute | null, tokenOut: Token) {
    console.log("====================================================")
    console.log("   " + caption + ":")
    if (route == null || route.methodParameters === undefined)
        console.log("   No route loaded\n");
    else {
        console.log(`\n   route:`);
        var n = 1;
        for (let r of route.route) {
            console.log(`   ${n++}. ${r.percent}% am=${r.amount.toFixed(2)} ${r.protocol}:${getPathStr(r.tokenPath)} gas=$${r.gasCostInUSD.toFixed(2)}`);
            console.log(`   poolAddrs=${r.poolAddresses.join(" ")}`);
        }


        console.log(`\n   trade swaps:`);
        n = 1;
        for (let swap of route.trade.swaps) {
            const inp = parseFloat(swap.inputAmount.toFixed());
            const out = parseFloat(swap.outputAmount.toFixed());
            const rate = (out / inp).toFixed(2);
            console.log(`   ${n++}. in=${swap.inputAmount.toFixed(2)} out=${swap.outputAmount.toFixed(2)} ${swap.route.protocol} path=${getPathStr(swap.route.path)} rate=${rate}`);
        }

        console.log(`\n   pools:`);
        n = 1;
        for (var i = 0; i < route.trade.routes.length; i++) {
            var tr = route.trade.routes[i];

            console.log(`   route ${n++}:`);

            for (var j = 0; j < tr.pools.length; j++) {
                const isPool = (tr.pools[j] as Pool).fee;
                const pair = tr.pools[j];
                var fee: FeeAmount = 3000;

                var v3Info = "";
                var addr = "";
                if (isPool) {
                    var pool: Pool = tr.pools[j] as Pool;
                    v3Info = `liq=${pool.liquidity} tickCur=${pool.tickCurrent}`;
                    fee = pool.fee;
                    addr = Pool.getAddress(tr.path[j], tr.path[j + 1], fee);
                } else {
                    addr = Pair.getAddress(tr.path[j], tr.path[j + 1]);
                }

                console.log(`       ${isPool ? "V3" : "V2"}: ${tr.path[j].symbol}-${tr.path[j + 1].symbol} (${addr}): tok0pr=${pair.token0Price.toSignificant()} tok1pr=${pair.token1Price.toSignificant()} fee=${fee} ${v3Info}`);
            }
        }


        console.log(`   You'll get ${route.quote.toFixed(2)} of ${tokenOut.symbol}\n`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });


    // WBTC –   WETH: route.length: 2 trade.swaps.length: 2 trade.routes.length: 2
    //
    // chains.ETH_MAINNET: {
	// 	TokensToSpend: []tokens.Token{
	// 		{Symbol: "DAI", Decimals: 18, Address: "0x6B175474E89094C44Da98b954EedeAC495271d0F"},
	// 		{Symbol: "USDT", Decimals: 6, Address: "0xdAC17F958D2ee523a2206206994597C13D831ec7"},
	// 		{Symbol: "USDC", Decimals: 6, Address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"},
	// 	},
	// 	TokensToBuy: []tokens.Token{
	// 		{Symbol: "WBTC", Decimals: 8, Address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"},
	// 		{Symbol: "WETH", Decimals: 18, Address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"},
	// 		{Symbol: "ROOBEE", Decimals: 18, Address: "0xa31b1767e09f842ecfd4bc471fe44f830e3891aa"},
	// 	},
	// 	NativeTokenSymbol: "WETH",
