import { fetchTraderAssets, fetchTraderRecentTrades } from "./lib/solana";

async function test() {
    console.log("Fetching assets...");
    const assets = await fetchTraderAssets("j1oAbxxiDUWvoHxEDhWE7THLjEkDQW2cSHYn2vttxTF");
    console.log("Assets:", assets.length, assets.slice(0, 2));

    console.log("Fetching trades...");
    const trades = await fetchTraderRecentTrades("j1oAbxxiDUWvoHxEDhWE7THLjEkDQW2cSHYn2vttxTF");
    console.log("Trades:", trades.length, trades.slice(0, 2));
}

test();
