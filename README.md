# Solana DEX Tracker Bot v2 (Pipeline & Image Edition)

A high-performance Telegram bot that discovers new Solana tokens on DexScreener and posts detailed reports including token images, real-time stats, and quick-trade links.

**Pipeline Update:** This version is optimized to act as a "Scout" for the **Solana Rug Analyzer**. The tracker bypasses heavy filtering to provide a high-frequency data feed. While the Tracker provides the visual "Newsfeed," the Rug Analyzer works in the background to perform deep security audits (Honeypot checks, Holder analysis) and posts the "Elite Calls" every 10 minutes.

## ✨ Features

- **Image Support:** Automatically fetches token icons or headers and posts them directly with the message.
- **Beautiful Layout:** Clean, professional design using un-destructible HTML formatting.
- **Pipeline Optimized:** No hard filters in the tracker to ensure a full data stream for the Rug Analyzer.
- **Spam Protection:** Integrated 3-second queue to prevent Telegram rate-limiting or bans.
- **Clean Links:** No hidden Markdown links (prevents Telegram preview clutter), only raw clickable links at the bottom.
- **Full Stats:** Market Cap, Price, Liquidity, Volume (1h/24h), Price Change (5m/1h/6h/24h), and Trade counts.

---

## What the Bot Posts (Example)

🚀 **Token Name** ($SYMBOL) 🟣💊
🌱 Age: 12m   👀 Boosts: 5

📊 **Token Stats**
➰ MC:   $45.50K
➰ USD:  $0.0000455 (+12.5% 5m)
➰ LIQ:  $18.20K
➰ VOL:  $150K (24h) | $45K (1h)

📈 **Price Change**
➰ 5M:  +12.50%
➰ 1H:  +45.00%
➰ 6H:  +120.00%
➰ 24H: +120.00%

📍 **Addresses**
➰ Token: BkjP1Um3ZZZTyGVxd7vrRaqGiaZC2K2Xk2VjKexzpump
➰ Pool:  B7dv...czEL

🔗 **Socials**
TG • 𝕏 • Web

... (and more)

BkjP1Um3ZZZTyGVxd7vrRaqGiaZC2K2Xk2VjKexzpump
https://dexscreener.com/solana/BkjP1Um3ZZZTyGVxd7vrRaqGiaZC2K2Xk2VjKexzpump

---

## Setup (Windows / Server / Termux)

> Requires Node.js 18+ and Git.

### 1. Installation
```bash
git clone <your-repo-link>
cd Solana-dex-tracker
npm install
```

### 2. Configuration (.env)
Create a `.env` file in the root directory:
```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=@yourchannel
```

### 3. Start (with PM2)
```bash
pm2 start index.js --name DexTracker
```

---

## Architecture & Filtering (IMPORTANT)

In this Pipeline Edition, strict filters (like `MIN_LIQUIDITY` or `MAX_MARKETCAP`) have been intentionally removed from the Tracker.

**Why?** The DexTracker acts as a "Dumb Scout." Its job is to find everything. The "Smart Analysis" (Holder counts, Mint/Freeze checks, strict MC limits) is handled by the **Solana Rug Analyzer**, which monitors this channel and picks the "Winner" every 10 minutes.

---

## Security
- `.env` is included in `.gitignore` – your tokens will never be pushed to GitHub.
- The bot only makes outgoing HTTPS calls to DexScreener & Telegram.

## Troubleshooting
**SyntaxError: Unexpected end of input** -> This usually happens when copying code manually into Termux/Nano and the last bracket is missing. Delete index.js and paste the code again carefully.
