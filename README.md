# bountychain
# ⬡ BountyChain

> **A decentralized, trustless micro-bounty platform for the gig economy.**

![BountyChain Prototype UI](https://via.placeholder.com/800x400/050505/7DF9C0?text=BountyChain+UI+Preview)

## 💡 The Vision
In the traditional gig economy, platforms take massive cuts (up to 20%) just to act as an intermediary, and payouts are often delayed. **BountyChain** eliminates the middleman. By utilizing simulated smart contract escrow and role-based verification, we create a trustless environment where developers and creators can post technical problems, and "hunters" can solve them for instant, automated crypto payouts.

This project was built during a fast-paced hackathon as a pure frontend prototype, architected specifically to be cleanly migrated into a full **MERN stack** (MongoDB, Express, React, Node) with a **Solidity** Web3 backend.

## ✨ Key Features
* **Role-Based Workflows:** Distinct user journeys for 'Bounty Owners' (who lock funds and verify) and 'Bounty Hunters' (who submit code and claim rewards).
* **Automated Escrow Simulation:** Demonstrates how a smart contract holds funds safely until a solution is explicitly approved by the owner or an admin.
* **Rate-Limiting Logic:** Built-in Hunter limits (e.g., 5 submissions/day) to prevent spam and encourage high-quality answers.
* **Premium UI/UX:** Ultra-dynamic, dark-neon interface featuring CSS-only animations, scroll-reveals via `IntersectionObserver`, and fully responsive design.
* **Real-Time Discovery:** Client-side search and filtering system for lightning-fast bounty discovery.

## 🛠️ Tech Stack & Architecture
This prototype relies on a lightweight, dependency-free stack to ensure maximum performance and easy deployment for the hackathon:
* **Frontend:** Vanilla HTML5, CSS3 (CSS Variables, Flexbox/Grid), and ES6+ JavaScript.
* **Design System:** Custom token-based CSS system (Space Mono & Outfit fonts).
* **Architecture Prep:** State management and DOM manipulation are strictly decoupled to allow for immediate integration into React components. Data objects are structured to map directly to standard MongoDB NoSQL schemas.

## 🚀 How to Run Locally
Because this is a zero-dependency prototype, running it is incredibly simple:
1. Clone the repository: `git clone https://github.com/yourusername/BountyChain.git`
2. Navigate to the project directory: `cd BountyChain`
3. Open `index.html` in any modern web browser. (Alternatively, use a Live Server extension in VS Code for hot-reloading).

## 🔮 Future Road Map
To take BountyChain from a hackathon prototype to a mainnet dApp, the following architecture is planned:
1. **Web3 Integration:** Replace simulated logins with `ethers.js` or `wagmi` for live MetaMask wallet connections.
2. **Smart Contracts:** Deploy the core escrow logic (`createBounty`, `submitSolution`, `releaseFunds`) using Solidity on Ethereum or a Layer 2 network like Polygon for lower gas fees.
3. **MERN Backend:** Implement an Express/Node.js backend and MongoDB database to store heavy text data (descriptions, code blocks) off-chain, keeping blockchain transactions fast and cheap.
