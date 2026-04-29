/* eslint-disable no-console */
'use strict';
require('dotenv').config();
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SCAN_INTERVAL = 15000; 

const bot = new TelegramBot(BOT_TOKEN, { polling: false });
const seen = new Set();
const postQueue = [];

const fmtNum = (n) => {
    if (!n || isNaN(n)) return '0.00';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return Number(n).toFixed(2);
};
const fmtPct = (n) => (n > 0 ? '+' : '') + Number(n).toFixed(2) + '%';
const shortAddr = (a) => a ? `${a.slice(0, 4)}...${a.slice(-4)}` : '?';

function getAgeString(createdAt) {
    if (!createdAt) return 'N/A';
    const diffMs = Date.now() - createdAt;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = diffMins / 60;
    const diffDays = diffHours / 24;
    if (diffDays >= 1) return `${Math.floor(diffDays)}d`;
    if (diffHours >= 1) return `${diffHours.toFixed(1)}h`;
    return `${diffMins}m`;
}

async function scan() {
    try {
        const res = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
        const data = await res.json();
        if (!Array.isArray(data)) return;

        for (const item of data) {
            if (item.chainId !== 'solana' || seen.has(item.tokenAddress)) continue;
            seen.add(item.tokenAddress);

            const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${item.tokenAddress}`);
            const pairData = await pairRes.json();
            const pair = pairData.pairs?.find(p => p.chainId === 'solana');
            
            if (!pair) continue;
            // KEIN LIQUIDITÄTS-FILTER MEHR! Der Tracker ist dumm und sammelt nur!

            postQueue.push({ item, pair });
        }
    } catch (e) { console.error("Scan Error:", e.message); }
}

setInterval(async () => {
    if (postQueue.length === 0) return;
    const { item, pair } = postQueue.shift();

    const mc = pair.fdv || pair.marketCap || 0;
    const liq = pair.liquidity?.usd || 0;
    const vol24 = pair.volume?.h24 || 0;
    const ageStr = getAgeString(pair.pairCreatedAt);
    const boosts = item.boosts || 0;
    
    const soc = item.links || [];
    const tg = soc.find(s => s.type === 'telegram') ? 'TG' : '~TG~';
    const x = soc.find(s => s.type === 'twitter') ? '𝕏' : '~𝕏~';
    const web = soc.find(s => s.type === 'website') ? 'Web' : '~Web~';
    const socialsStr = [tg, x, web].join(' • ');

    const description = item.description ? `\n📝 ${item.description.slice(0, 100)}${item.description.length > 100 ? '...' : ''}\n` : '';

    let auditLines = '';
    if (boosts > 0) auditLines += `✅ DEX PAID\n`;
    if (liq > 15000) auditLines += `✅ Liquidity OK ($${fmtNum(liq)})\n`;
    else auditLines += `⚠️ Low Liquidity ($${fmtNum(liq)})\n`;

    let msg = `🚀 ${pair.baseToken.name} ($${pair.baseToken.symbol}) 🟣💊\n`;
    msg += `🌱 Age: ${ageStr}   👀 Boosts: ${boosts}\n\n`;

    msg += `📊 Token Stats\n`;
    msg += `➰ MC:   $${fmtNum(mc)}\n`;
    msg += `➰ USD:  $${pair.priceUsd} (${fmtPct(pair.priceChange?.m5)} 5m)\n`;
    msg += `➰ LIQ:  $${fmtNum(liq)}\n`;
    msg += `➰ VOL:  $${fmtNum(vol24)} (24h) | $${fmtNum(pair.volume?.h1)} (1h)\n\n`;

    msg += `📈 Price Change\n`;
    msg += `➰ 5M:  ${fmtPct(pair.priceChange?.m5)}\n`;
    msg += `➰ 1H:  ${fmtPct(pair.priceChange?.h1)}\n`;
    msg += `➰ 6H:  ${fmtPct(pair.priceChange?.h6)}\n`;
    msg += `➰ 24H: ${fmtPct(pair.priceChange?.h24)}\n\n`;

    msg += `📉 Trades\n`;
    msg += `➰ 1H:  B ${pair.txns?.h1?.buys || 0} / S ${pair.txns?.h1?.sells || 0}\n`;
    msg += `➰ 24H: B ${pair.txns?.h24?.buys || 0} / S ${pair.txns?.h24?.sells || 0}\n\n`;

    msg += `👥 Holders\n`;
    msg += `➰ HLD: N/A (Fast scan)\n`;
    msg += `➰ Top 10: N/A\n\n`;

    msg += `📍 Addresses\n`;
    msg += `➰ Token: ${item.tokenAddress}\n`;
    msg += `➰ Pool:  ${shortAddr(pair.pairAddress)}\n\n`;

    msg += `🔗 Socials\n${socialsStr}\n\n`;

    msg += `⚠️ Audit 🟧🟥\n${auditLines}\n`;

    msg += `📊 Charts\n`;
    msg += `DEX • GT • BIRD • SCAN • DEF\n\n`;

    msg += `🤖 Trading\n`;
    msg += `Photon • Axiom • BullX • GMGN • Trojan • Maestro • Banana\n`;
    msg += `${description}\n`;
    
    // NUR NOCH REINE LINKS AM ENDE
    msg += `${item.tokenAddress}\n`;
    msg += `https://dexscreener.com/solana/${item.tokenAddress}`;

    try {
        await bot.sendMessage(CHAT_ID, msg, { disable_web_page_preview: true });
        console.log(`✅ Posted Detail-View: ${pair.baseToken.symbol}`);
    } catch (e) { console.error("Post Error:", e.message); }
}, 3000); 

setInterval(scan, SCAN_INTERVAL);
scan();
console.log("🚀 DexTracker (DUMB & CLEAN Mode) aktiv!");
