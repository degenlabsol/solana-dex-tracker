/* eslint-disable no-console */
'use strict';
require('dotenv').config();
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');

// =====================================================
// Configuration
// =====================================================
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SCAN_INTERVAL  = parseInt(process.env.SCAN_INTERVAL_MS)  || 12000;  // scan every 12s
const POST_COOLDOWN  = parseInt(process.env.POST_COOLDOWN_MS)  || 5000;   // 5s between posts
const SEEN_TTL_MS    = 25 * 60 * 1000;                                    // 25min: then postable again

const MIN_LIQUIDITY  = parseInt(process.env.MIN_LIQUIDITY)  || 0;
const MAX_MARKETCAP  = parseInt(process.env.MAX_MARKETCAP)  || 0;
const MIN_HOLDERS    = parseInt(process.env.MIN_HOLDERS)    || 0;

const SVS_API_KEY    = process.env.SVS_API_KEY    || '';
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || '';

if (!BOT_TOKEN || !CHAT_ID) {
    console.error('❌ MISSING ENV VARIABLES! Please set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.');
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// seen: addr → timestamp (when last posted)
// After SEEN_TTL_MS the token is released again
const seen = new Map();
let lastPostTime = 0;
let isPosting = false;

// Post Queue: Tokens to be posted
const postQueue = [];

process.on('uncaughtException',   (e) => console.error('Uncaught:', e.message));
process.on('unhandledRejection',  (e) => console.error('Unhandled:', e?.message || e));
process.on('SIGINT', () => { console.log('\n👋 Bot is shutting down...'); process.exit(0); });

// =====================================================
// Seen Management with TTL
// =====================================================
function isSeen(addr) {
    if (!seen.has(addr)) return false;
    const ts = seen.get(addr);
    if (Date.now() - ts > SEEN_TTL_MS) {
        seen.delete(addr);   // TTL expired → release again
        return false;
    }
    return true;
}

function markSeen(addr) {
    seen.set(addr, Date.now());
    // Memory limit: max 2000 entries
    if (seen.size > 2000) {
        const first = seen.keys().next().value;
        seen.delete(first);
    }
}

// =====================================================
// Helper Functions
// =====================================================
function fmt(num) {
    if (num === null || num === undefined || num === 'N/A' || isNaN(Number(num))) return 'N/A';
    const n = Number(num);
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    if (n >= 1)   return n.toFixed(2);
    if (n > 0)    return n.toPrecision(4);
    return '0';
}

function pct(num) {
    if (num === null || num === undefined || isNaN(Number(num))) return 'N/A';
    const n = Number(num);
    return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function shortAddr(a) {
    if (!a) return '';
    return `${a.slice(0, 4)}...${a.slice(-4)}`;
}

function ageFromMs(ms) {
    if (!ms) return 'N/A';
    const diff = Date.now() - ms;
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}

function escapeMd(text) {
    if (text === null || text === undefined) return '';
    return String(text).replace(/([_*`\[\]])/g, '\\$1');
}

// =====================================================
// API Calls
// =====================================================
async function safeFetch(url, opts = {}, timeoutMs = 10000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...opts, signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        clearTimeout(t);
        return null;
    }
}

async function dsLatestProfiles() {
    const data = await safeFetch('https://api.dexscreener.com/token-profiles/latest/v1');
    return Array.isArray(data) ? data : (data ? [data] : []);
}

async function dsLatestBoosts() {
    const data = await safeFetch('https://api.dexscreener.com/token-boosts/latest/v1');
    return Array.isArray(data) ? data : (data ? [data] : []);
}

async function dsTopBoosts() {
    const data = await safeFetch('https://api.dexscreener.com/token-boosts/top/v1');
    return Array.isArray(data) ? data : (data ? [data] : []);
}

async function dsTokenPairs(tokenAddress) {
    const json = await safeFetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    if (!json?.pairs?.length) return null;
    const sol = json.pairs.filter(p => p.chainId === 'solana');
    if (!sol.length) return null;
    sol.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    return sol[0];
}

async function gtToken(tokenAddress) {
    const json = await safeFetch(
        `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenAddress}`,
        { headers: { 'accept': 'application/json' } }
    );
    return json?.data?.attributes || null;
}

async function gtTokenInfo(tokenAddress) {
    const json = await safeFetch(
        `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenAddress}/info`,
        { headers: { 'accept': 'application/json' } }
    );
    return json?.data?.attributes || null;
}

async function svsPrice(tokenAddress) {
    if (!SVS_API_KEY) return null;
    const json = await safeFetch(
        `https://api.solanavibestation.com/v1/token/price?address=${tokenAddress}`,
        { headers: { 'x-api-key': SVS_API_KEY, 'accept': 'application/json' } }
    );
    return json?.data || json || null;
}

// =====================================================
// Audit
// =====================================================
function buildAudit(pair, gtInfo) {
    const flags = [];
    let score = 0, max = 0;

    max++;
    if (pair?.boosts?.active > 0 || pair?.labels?.includes('dex-paid')) {
        flags.push('✅ DEX [PAID]'); score++;
    }

    max++;
    const liq = pair?.liquidity?.usd || 0;
    if (liq >= 10000) { flags.push('✅ Liquidity OK'); score++; }
    else if (liq > 0)   flags.push(`⚠️ Low Liquidity ($${fmt(liq)})`);

    if (gtInfo?.gt_score !== undefined) {
        max++;
        if (gtInfo.gt_score >= 50) { flags.push(`✅ GT Score ${Math.round(gtInfo.gt_score)}`); score++; }
        else                          flags.push(`⚠️ GT Score ${Math.round(gtInfo.gt_score)}`);
    }

    const ratio = max > 0 ? score / max : 0;
    const emoji = ratio >= 0.8 ? '🟩🟩🟩' : ratio >= 0.5 ? '🟨🟨' : '🟧🟥';
    return { flags, emoji };
}

// =====================================================
// Build Message
// =====================================================
function buildMessage({ profile, pair, gt, gtInfo, svs }) {
    const tokenAddress = profile.tokenAddress;
    const base   = pair?.baseToken || {};
    const name   = escapeMd(base.name   || gt?.name   || profile.name   || 'Unknown');
    const symbol = escapeMd(base.symbol || gt?.symbol || 'N/A');

    const price  = pair?.priceUsd || gt?.price_usd || svs?.price || 0;
    const mc     = pair?.marketCap || pair?.fdv || gt?.fdv_usd || gt?.market_cap_usd || 0;
    const ath    = gt?.ath_price_usd
        ? Number(gt.ath_price_usd) * (Number(pair?.fdv || 0) / Number(price || 1))
        : null;
    const liq    = pair?.liquidity?.usd || gt?.total_reserve_in_usd || 0;
    const vol24  = pair?.volume?.h24    || gt?.volume_usd?.h24 || 0;
    const vol1h  = pair?.volume?.h1     || 0;

    const ch5m  = pair?.priceChange?.m5;
    const ch1h  = pair?.priceChange?.h1;
    const ch6h  = pair?.priceChange?.h6;
    const ch24h = pair?.priceChange?.h24;

    const buys1h  = pair?.txns?.h1?.buys   ?? 0;
    const sells1h = pair?.txns?.h1?.sells  ?? 0;
    const buys24h = pair?.txns?.h24?.buys  ?? 0;
    const sells24h= pair?.txns?.h24?.sells ?? 0;

    const holders = gt?.holders?.count || gtInfo?.holders?.count || 'N/A';
    const top10   = gtInfo?.holders?.distribution_percentage?.top_10
                 || gt?.holders?.distribution_percentage?.top_10
                 || null;

    const age     = pair?.pairCreatedAt ? ageFromMs(pair.pairCreatedAt) : 'N/A';
    const poolAddr= pair?.pairAddress || gt?.address || '';
    const dexUrl  = pair?.url || `https://dexscreener.com/solana/${tokenAddress}`;

    // Socials
    const socials = {};
    if (pair?.info?.socials) {
        for (const s of pair.info.socials) {
            if (s.type === 'twitter' || s.url?.includes('x.com') || s.url?.includes('twitter.com')) socials.x  = s.url;
            else if (s.type === 'telegram' || s.url?.includes('t.me'))                               socials.tg = s.url;
            else if (s.type === 'discord')                                                            socials.dc = s.url;
        }
    }
    if (pair?.info?.websites?.[0]?.url && !socials.web)    socials.web = pair.info.websites[0].url;
    if (gtInfo?.websites?.[0] && !socials.web)              socials.web = gtInfo.websites[0];
    if (gtInfo?.twitter_handle && !socials.x)               socials.x   = `https://x.com/${gtInfo.twitter_handle}`;
    if (gtInfo?.telegram_handle && !socials.tg)             socials.tg  = `https://t.me/${gtInfo.telegram_handle}`;

    const audit = buildAudit(pair, gtInfo);

    let m = '';
    m += `🚀 *${name}* ($${symbol})${profile.totalAmount ? ' 🟣💊' : ''}\n`;
    m += `🌱 Age: ${age}   👀 Boosts: ${profile.totalAmount || profile.amount || 0}\n\n`;

    m += `📊 *Token Stats*\n`;
    m += `➰ MC:   $${fmt(mc)}\n`;
    if (ath && ath > 0) m += `➰ ATH:  $${fmt(ath)}\n`;
    m += `➰ USD:  $${fmt(price)}${ch5m !== undefined ? ` (${pct(ch5m)} 5m)` : ''}\n`;
    m += `➰ LIQ:  $${fmt(liq)}\n`;
    m += `➰ VOL:  $${fmt(vol24)} (24h)`;
    if (vol1h) m += ` | $${fmt(vol1h)} (1h)`;
    m += '\n';

    m += `\n📈 *Price Change*\n`;
    m += `➰ 5M:  ${pct(ch5m)}\n`;
    m += `➰ 1H:  ${pct(ch1h)}\n`;
    m += `➰ 6H:  ${pct(ch6h)}\n`;
    m += `➰ 24H: ${pct(ch24h)}\n`;

    m += `\n📉 *Trades*\n`;
    m += `➰ 1H:  B ${buys1h} / S ${sells1h}\n`;
    m += `➰ 24H: B ${buys24h} / S ${sells24h}\n`;

    m += `\n👥 *Holders*\n`;
    m += `➰ HLD: ${holders}\n`;
    if (top10) m += `➰ Top 10: ${Number(top10).toFixed(2)}%\n`;

    m += `\n📍 *Addresses*\n`;
    m += `➰ Token: \`${tokenAddress}\`\n`;
    if (poolAddr) m += `➰ Pool:  [${shortAddr(poolAddr)}](https://solscan.io/account/${poolAddr})\n`;

    const socialLinks = [];
    if (socials.tg)  socialLinks.push(`[TG](${socials.tg})`);
    if (socials.x)   socialLinks.push(`[𝕏](${socials.x})`);
    if (socials.web) socialLinks.push(`[Web](${socials.web})`);
    if (socials.dc)  socialLinks.push(`[DC](${socials.dc})`);
    if (socialLinks.length > 0) m += `\n🔗 *Socials*\n${socialLinks.join(' • ')}\n`;

    m += `\n⚠️ *Audit* ${audit.emoji}\n`;
    if (audit.flags.length > 0) m += audit.flags.join('\n') + '\n';
    else m += `No audit data available\n`;

    m += `\n📊 *Charts*\n`;
    m += [
        `[DEX](${dexUrl})`,
        `[GT](https://www.geckoterminal.com/solana/pools/${poolAddr || tokenAddress})`,
        `[BIRD](https://birdeye.so/token/${tokenAddress}?chain=solana)`,
        `[SCAN](https://solscan.io/token/${tokenAddress})`,
        `[DEF](https://www.defined.fi/sol/${tokenAddress})`,
    ].join(' • ') + '\n';

    m += `\n🤖 *Trading*\n`;
    m += [
        `[Photon](https://photon-sol.tinyastro.io/en/r/@/${tokenAddress})`,
        `[Axiom](https://axiom.trade/t/${tokenAddress})`,
        `[BullX](https://bullx.io/terminal?chainId=1399811149&address=${tokenAddress})`,
        `[GMGN](https://gmgn.ai/sol/token/${tokenAddress})`,
        `[Trojan](https://t.me/achilles_trojanbot?start=r-${tokenAddress})`,
        `[Maestro](https://t.me/MaestroSniperBot?start=${tokenAddress})`,
        `[Banana](https://t.me/BananaGun_bot?start=snp_${tokenAddress})`,
    ].join(' • ') + '\n';

    const desc = profile.description || gtInfo?.description;
    if (desc && desc.length > 0) {
        const short = desc.length > 200 ? desc.slice(0, 200) + '…' : desc;
        m += `\n📝 _${escapeMd(short)}_\n`;
    }

    return m;
}

// =====================================================
// Sending
// =====================================================
async function sendPost(profile, pair, gt, gtInfo, svs) {
    const now = Date.now();
    if (now - lastPostTime < POST_COOLDOWN) return false;

    let message;
    try {
        message = buildMessage({ profile, pair, gt, gtInfo, svs });
    } catch (buildErr) {
        console.error('❌ buildMessage Error:', buildErr.message);
        return false;
    }

    const imageUrl = profile.header || profile.icon || pair?.info?.imageUrl || gtInfo?.image_url;
    const opts = { parse_mode: 'Markdown', disable_web_page_preview: true };

    // Attempt 1: With Image
    if (imageUrl) {
        try {
            await bot.sendPhoto(CHAT_ID, imageUrl, { caption: message, ...opts });
            lastPostTime = Date.now();
            return true;
        } catch (e) {
            console.log(`⚠️ Photo error, trying without image...`);
        }
    }

    // Attempt 2: Only Text with Markdown
    try {
        await bot.sendMessage(CHAT_ID, message, opts);
        lastPostTime = Date.now();
        return true;
    } catch (e) {
        // Attempt 3: Plain-Text Fallback
        try {
            const plainMsg = message.replace(/[*_`\[\]]/g, '').replace(/\\/g, '');
            await bot.sendMessage(CHAT_ID, plainMsg, { disable_web_page_preview: true });
            lastPostTime = Date.now();
            return true;
        } catch (e2) {
            console.error('❌ Telegram Error (all attempts):', e2.message);
            return false;
        }
    }
}

// =====================================================
// Queue Worker: runs independently of scan interval
// Posts as soon as something is in the queue and cooldown ok
// =====================================================
async function processQueue() {
    if (isPosting || postQueue.length === 0) return;

    const now = Date.now();
    if (now - lastPostTime < POST_COOLDOWN) return;

    isPosting = true;
    const job = postQueue.shift();

    try {
        const ok = await sendPost(job.profile, job.pair, job.gt, job.gtInfo, job.svs);
        if (ok) {
            const sym = job.pair?.baseToken?.symbol || job.profile.tokenAddress;
            const hasBild = !!(job.profile.header || job.profile.icon || job.pair?.info?.imageUrl || job.gtInfo?.image_url);
            console.log(`✅ Posted Detail-View (Image: ${hasBild}): ${sym}`);
        } else {
            // On error: Put token back at the front of the queue (max 1 retry)
            if (!job.retried) {
                job.retried = true;
                postQueue.unshift(job);
            }
        }
    } catch (e) {
        console.error('Queue Worker Error:', e.message);
    }

    isPosting = false;
}

// Queue Worker runs every 1.5 seconds
setInterval(processQueue, 1500);

// =====================================================
// Scan: collects new tokens and adds them to the queue
// =====================================================
async function scan() {
    const ts = new Date().toLocaleTimeString();

    const [profiles, boosts, top] = await Promise.all([
        dsLatestProfiles(),
        dsLatestBoosts(),
        dsTopBoosts(),
    ]);

    // Dedupe
    const map = new Map();
    for (const item of [...profiles, ...boosts, ...top]) {
        if (!item || item.chainId !== 'solana' || !item.tokenAddress) continue;
        if (!map.has(item.tokenAddress)) map.set(item.tokenAddress, item);
    }

    let added = 0;
    for (const item of map.values()) {
        if (isSeen(item.tokenAddress)) continue;

        // Fetch data in parallel
        const [pair, gt, gtInfo, svs] = await Promise.all([
            dsTokenPairs(item.tokenAddress),
            gtToken(item.tokenAddress),
            gtTokenInfo(item.tokenAddress),
            svsPrice(item.tokenAddress),
        ]);

        if (!pair) continue;

        // Optional Filters
        const liq = pair.liquidity?.usd || 0;
        const mc  = pair.marketCap || pair.fdv || 0;
        if (MIN_LIQUIDITY > 0 && liq < MIN_LIQUIDITY) continue;
        if (MAX_MARKETCAP > 0 && mc  > MAX_MARKETCAP) continue;
        if (MIN_HOLDERS   > 0) {
            const h = gt?.holders?.count || gtInfo?.holders?.count || 0;
            if (h < MIN_HOLDERS) continue;
        }

        // Mark as seen and put in queue
        markSeen(item.tokenAddress);
        postQueue.push({ profile: item, pair, gt, gtInfo, svs });
        added++;
    }

    if (added > 0) {
        console.log(`🔍 Scan @ ${ts} → ${added} new tokens in queue (Queue: ${postQueue.length}, seen: ${seen.size})`);
    }
}

// =====================================================
// Start
// =====================================================
console.log('🚀 Solana DEX Tracker Bot started');
console.log(`   Scan Interval:  ${SCAN_INTERVAL}ms`);
console.log(`   Post Cooldown:  ${POST_COOLDOWN}ms`);
console.log(`   Seen TTL:       ${SEEN_TTL_MS / 60000}min`);
console.log(`   Min. Liquidity: ${MIN_LIQUIDITY > 0 ? '$' + MIN_LIQUIDITY : 'no filter'}`);
console.log(`   Max. Marketcap: ${MAX_MARKETCAP > 0 ? '$' + MAX_MARKETCAP : 'no filter'}`);
console.log(`   GeckoTerminal:  on`);
console.log(`   Solana Vibe:    ${SVS_API_KEY     ? 'on' : 'off'}`);
console.log(`   Birdeye:        ${BIRDEYE_API_KEY ? 'on' : 'off'}`);

scan().catch(e => console.error('Scan Error:', e.message));
setInterval(() => scan().catch(e => console.error('Scan Error:', e.message)), SCAN_INTERVAL);
                                                           
