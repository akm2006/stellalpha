import { fetchTraderAssets, fetchTraderRecentTrades } from "./lib/solana";

async function test() {
    console.log("Testing Helius RPC...");
    try {
        const assets = await fetchTraderAssets("j1oAbxxiDUWvoHxEDhWE7THLjEkDQW2cSHYn2vttxTF");
        console.log("Assets fetched:", assets.length);
        if (assets.length > 0) console.log("First asset:", assets[0].symbol);

        const trades = await fetchTraderRecentTrades("j1oAbxxiDUWvoHxEDhWE7THLjEkDQW2cSHYn2vttxTF");
        console.log("Trades fetched:", trades.length);
        if (trades.length > 0) console.log("First trade:", trades[0].signature);

        console.log("Helius RPC Test Passed!");
    } catch (e) {
        console.error("Helius RPC Test Failed:", e);
    }
}

test();
