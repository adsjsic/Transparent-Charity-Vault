# 💎 Transparent Charity Vault

Welcome to **Transparent Charity Vault**, a Web3 solution built on the Stacks blockchain using Clarity smart contracts! This project tackles the real-world problem of opaque charity fund allocation by creating verifiable, tamper-proof savings accounts for non-profits. Donors can track every cent in real-time, ensuring funds go exactly where promised—building trust and accountability in philanthropy.

## ✨ Features

🔍 **Real-Time Fund Tracking**  
View live balances, allocations, and transaction histories for any campaign.

💰 **Multi-Tier Allocation**  
Automatically distribute donations across admin-defined buckets (e.g., operations, projects, reserves) with on-chain rules.

🛡️ **Governance Controls**  
Admins propose and vote on fund releases via time-locked multisig, preventing misuse.

📊 **Impact Reporting**  
Generate automated reports linking funds to verifiable outcomes (e.g., milestones achieved).

⚖️ **Auditor Access**  
Third-party auditors can query and verify without altering data.

📱 **Donor Incentives**  
Optional NFT badges for donors, redeemable for impact updates or exclusive perks.

🚫 **Fraud Prevention**  
Built-in duplicate donation checks and anomaly alerts via oracle integrations.

## 🛠 How It Works

**For Donors**  
- Browse active campaigns via the frontend dashboard.  
- Donate STX or tokens to a campaign's vault address.  
- Receive instant confirmations and a unique donor ID for tracking.  
- Query your personal donation history and see fund flows in real-time.  

**For Charity Admins**  
- Deploy a new campaign vault with allocation rules (e.g., 40% projects, 30% ops).  
- Propose fund releases with justifications; require multisig approval.  
- Update impact milestones to unlock donor rewards.  

**For Auditors/Verifiers**  
- Use public read functions to audit balances and transactions.  
- Cross-reference with off-chain oracles for outcome verification.  

Under the hood, 8 Clarity smart contracts power the system:  
1. **CharityVault** - Core savings account for holding and allocating funds.  
2. **CampaignFactory** - Deploys new campaign instances.  
3. **AllocationManager** - Enforces multi-bucket distribution rules.  
4. **GovernanceModule** - Handles proposals, voting, and multisig releases.  
5. **DonorRegistry** - Tracks donor contributions and issues incentives.  
6. **ImpactTracker** - Logs milestones and generates reports.  
7. **AuditorInterface** - Read-only queries for external verification.  
8. **OracleIntegrator** - Fetches off-chain data for fraud detection.  

## 🚀 Getting Started

Clone the repo, install Clarity tools, and deploy to Stacks testnet. Check `contracts/` for the full suite—each contract is modular for easy extension. Let's make charity transparent, one block at a time! 🌟