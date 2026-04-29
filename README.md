# 📈 Solana DEX Tracker Bot

![Node.js](https://img.shields.io/badge/Node.js-18.x-green)
![Telegram API](https://img.shields.io/badge/Telegram-Bot%20API-blue)
![Solana](https://img.shields.io/badge/Solana-Web3-purple)
![License](https://img.shields.io/badge/License-MIT-brightgreen)

An automated Telegram bot that continuously monitors [DexScreener](https://dexscreener.com/) for new Solana token profiles and boosted pairs. It filters out the noise based on your custom criteria (liquidity, market cap, holders) and delivers highly detailed, real-time token alerts directly to your Telegram channel.

## ✨ Features
* **Automated Polling:** Continuously scans DexScreener's `latest profiles`, `latest boosts`, and `top boosts` endpoints.
* **Smart Filtering:** Only forwards tokens that meet your strict criteria (e.g., Minimum Liquidity > $3000, Max Market Cap < $500k).
* **Multi-API Enrichment:** Automatically fetches additional context from:
  * [GeckoTerminal](https://www.geckoterminal.com/) (Social links, holder counts, GT Security Score)
  * [Birdeye](https://birdeye.so/) & Solana Vibe Station (Optional fallback pricing)
* **Anti-Spam System:** Built-in `seen` cache and cooldown timers ensure your channel isn't flooded with duplicate or rapid-fire alerts.
* **Rich Media:** Automatically attaches the token's logo/header image to the alert if available.

---

## 📊 Example Output
When a token passes your filters, the bot sends a comprehensive alert to your channel:

> 🚀 **DegenToken** ($DEGEN) 🟣💊
> 🌱 Age: 12m   👀 Boosts: 5
> 
> 📊 **Token Stats**
> ➰ MC:   $45.50K
> ➰ USD:  $0.0000455 (+12.4% 5m)
> ➰ LIQ:  $15.20K
> ➰ VOL:  $85.10K (24h) | $30.50K (1h)
> 
> 📈 **Price Change**
> ➰ 5M:  +12.4% | 1H: +45.2% | 24H: +45.2%
> 
> 📉 **Trades**
> ➰ 1H:  B 450 / S 120
> ➰ 24H: B 450 / S 120
> 
> 👥 **Holders**
> ➰ HLD: 154 | Top 10: 18.50%
> 
> 📍 **Addresses**
> ➰ Token: `DeGenXyz123456789abcdefghijklmnopqrstuv`
> 
> 🔗 **Socials**
> [TG](https://t.me/...) • [𝕏](https://x.com/...) • [Web](https://...)
> 
> ⚠️ **Audit** 🟩🟩🟩
> ✅ DEX [PAID]
> ✅ Liquidity OK
> ✅ GT Score 85
> 
> 📊 **Charts**
> [DEX] • [BIRD]
> 
> 🤖 **Trade**
> [Photon] • [BullX]
> 
> 📝 _The ultimate community driven token on Solana..._

---

## 🚀 Installation & Setup

### 1. Prerequisites
* **Node.js** (v18 or higher)
* **Telegram Bot Token:** Create a new bot via [@BotFather](https://t.me/botfather) on Telegram and get your token.

### 2. Clone and Install
Open your terminal (CMD/PowerShell) and run:
```bash
git clone [https://github.com/degenlabsol/solana-dex-tracker.git](https://github.com/degenlabsol/solana-dex-tracker.git)
cd solana-dex-tracker
npm install

### 3. Configuration (.env)
Create a .env file in the root directory. You can use the provided .env.example as a template:

# Telegram Setup
TELEGRAM_BOT_TOKEN=123456789:ABCDefghIJKLmnopQRSTuvwxYZ
TELEGRAM_CHAT_ID=-1001234567890

# Timing (in milliseconds)
SCAN_INTERVAL_MS=15000
POST_COOLDOWN_MS=8000

# Filters
MIN_LIQUIDITY=3000
MAX_MARKETCAP=500000
MIN_HOLDERS=0

# Optional API Keys (Leave blank if you don't have them)
SVS_API_KEY=
BIRDEYE_API_KEY=

Note: Make sure your bot is added as an Administrator to the target channel/group so it has permission to send messages.

### 4. Run the Bot
To start the tracker manually:

npm start

For 24/7 deployment on a server (like a Raspberry Pi or VPS), it is recommended to use a process manager like PM2.

⚠️ Disclaimer
This software is for educational and informational purposes only. Do not use this as financial advice. Trading Solana meme coins is highly risky. Always DYOR (Do Your Own Research).

