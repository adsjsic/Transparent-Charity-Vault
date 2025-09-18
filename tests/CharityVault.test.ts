import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV, principalCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_AMOUNT = 101;
const ERR_ALLOCATION_FAILED = 102;
const ERR_WITHDRAWAL_NOT_APPROVED = 103;
const ERR_CAMPAIGN_CLOSED = 104;
const ERR_INVALID_PERCENT = 105;
const ERR_BUCKET_NOT_FOUND = 106;
const ERR_INSUFFICIENT_BALANCE = 107;
const ERR_INVALID_BUCKET_NAME = 108;
const ERR_MAX_BUCKETS_EXCEEDED = 109;

interface Bucket {
  balance: number;
  allocatedPercent: number;
  description: string;
}

interface HistoryEntry {
  timestamp: number;
  amount: number;
  bucket: string;
  donor: string;
}

interface Proposal {
  id: number;
  amount: number;
  bucket: string;
  recipient: string;
  proposer: string;
  approvals: number;
  requiredApprovals: number;
  status: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class CharityVaultMock {
  state: {
    campaignOwner: string;
    isActive: boolean;
    totalFunds: number;
    creationTimestamp: number;
    buckets: Map<string, Bucket>;
    allocationsHistory: Map<number, HistoryEntry>;
    withdrawalProposals: Map<number, Proposal>;
    nextProposalId: number;
    nextHistoryId: number;
    numBuckets: number;
    maxBuckets: number;
    requiredApprovals: number;
  } = {
    campaignOwner: "ST1TEST",
    isActive: true,
    totalFunds: 0,
    creationTimestamp: 0,
    buckets: new Map(),
    allocationsHistory: new Map(),
    withdrawalProposals: new Map(),
    nextProposalId: 0,
    nextHistoryId: 0,
    numBuckets: 0,
    maxBuckets: 5,
    requiredApprovals: 2,
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      campaignOwner: "ST1TEST",
      isActive: true,
      totalFunds: 0,
      creationTimestamp: 0,
      buckets: new Map(),
      allocationsHistory: new Map(),
      withdrawalProposals: new Map(),
      nextProposalId: 0,
      nextHistoryId: 0,
      numBuckets: 0,
      maxBuckets: 5,
      requiredApprovals: 2,
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
  }

  isOwnerOrAdmin(caller: string): boolean {
    return caller === this.state.campaignOwner;
  }

  initializeBuckets(
    projPercent: number,
    opsPercent: number,
    resPercent: number,
    emerPercent: number,
    incPercent: number
  ): Result<boolean> {
    if (!this.isOwnerOrAdmin(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const total = projPercent + opsPercent + resPercent + emerPercent + incPercent;
    if (total !== 100) return { ok: false, value: ERR_INVALID_PERCENT };
    if (this.state.numBuckets >= this.state.maxBuckets) return { ok: false, value: ERR_MAX_BUCKETS_EXCEEDED };
    this.state.buckets.set("projects", { balance: 0, allocatedPercent: projPercent, description: "Project funding" });
    this.state.buckets.set("operations", { balance: 0, allocatedPercent: opsPercent, description: "Operational costs" });
    this.state.buckets.set("reserves", { balance: 0, allocatedPercent: resPercent, description: "Emergency reserves" });
    this.state.buckets.set("emergency", { balance: 0, allocatedPercent: emerPercent, description: "Emergency fund" });
    this.state.buckets.set("incentives", { balance: 0, allocatedPercent: incPercent, description: "Donor incentives" });
    this.state.numBuckets = 5;
    return { ok: true, value: true };
  }

  receiveDonation(amount: number): Result<boolean> {
    if (!this.state.isActive) return { ok: false, value: ERR_CAMPAIGN_CLOSED };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    this.stxTransfers.push({ amount, from: this.caller, to: "contract" });
    this.state.totalFunds += amount;
    const histId = this.state.nextHistoryId;
    this.state.allocationsHistory.set(histId, { timestamp: this.blockHeight, amount, bucket: "", donor: this.caller });
    this.state.nextHistoryId++;
    const buckets = ["projects", "operations", "reserves", "emergency", "incentives"];
    buckets.forEach(b => {
      const bucketData = this.state.buckets.get(b);
      if (bucketData) {
        const alloc = Math.floor((amount * bucketData.allocatedPercent) / 100);
        bucketData.balance += alloc;
        this.state.buckets.set(b, bucketData);
      }
    });
    return { ok: true, value: true };
  }

  proposeWithdrawal(amount: number, bucket: string, recipient: string): Result<number> {
    if (!this.state.isActive) return { ok: false, value: ERR_CAMPAIGN_CLOSED };
    if (!this.isOwnerOrAdmin(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    const bucketData = this.state.buckets.get(bucket);
    if (!bucketData) return { ok: false, value: ERR_BUCKET_NOT_FOUND };
    if (amount > bucketData.balance) return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    const allowedBuckets = ["projects", "operations", "reserves", "emergency", "incentives"];
    if (!allowedBuckets.includes(bucket)) return { ok: false, value: ERR_INVALID_BUCKET_NAME };
    const propId = this.state.nextProposalId;
    this.state.withdrawalProposals.set(propId, {
      id: propId,
      amount,
      bucket,
      recipient,
      proposer: this.caller,
      approvals: 0,
      requiredApprovals: this.state.requiredApprovals,
      status: false,
    });
    this.state.nextProposalId++;
    return { ok: true, value: propId };
  }

  approveProposal(propId: number): Result<boolean> {
    const proposal = this.state.withdrawalProposals.get(propId);
    if (!proposal) return { ok: false, value: ERR_WITHDRAWAL_NOT_APPROVED };
    if (proposal.status || !this.isOwnerOrAdmin(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const newApprovals = proposal.approvals + 1;
    if (newApprovals >= proposal.requiredApprovals) {
      proposal.approvals = newApprovals;
      proposal.status = true;
      this.stxTransfers.push({ amount: proposal.amount, from: "contract", to: proposal.recipient });
      const bucketData = this.state.buckets.get(proposal.bucket);
      if (bucketData) {
        bucketData.balance -= proposal.amount;
        this.state.buckets.set(proposal.bucket, bucketData);
      }
      this.state.totalFunds -= proposal.amount;
      this.state.withdrawalProposals.set(propId, proposal);
      return { ok: true, value: true };
    } else {
      proposal.approvals = newApprovals;
      this.state.withdrawalProposals.set(propId, proposal);
      return { ok: true, value: true };
    }
  }

  closeCampaign(): Result<boolean> {
    if (!this.isOwnerOrAdmin(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.isActive = false;
    return { ok: true, value: true };
  }

  setRequiredApprovals(newReq: number): Result<boolean> {
    if (!this.isOwnerOrAdmin(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newReq <= 0 || newReq > 5) return { ok: false, value: ERR_INVALID_AMOUNT };
    this.state.requiredApprovals = newReq;
    return { ok: true, value: true };
  }

  getTotalFunds(): number {
    return this.state.totalFunds;
  }

  getBucketBalances(name: string): Bucket | null {
    return this.state.buckets.get(name) || null;
  }

  getCampaignStatus(): boolean {
    return this.state.isActive;
  }

  getCampaignOwner(): string {
    return this.state.campaignOwner;
  }

  getAllBuckets(): string[] {
    return ["projects", "operations", "reserves", "emergency", "incentives"];
  }

  getProposal(id: number): Proposal | null {
    return this.state.withdrawalProposals.get(id) || null;
  }

  getHistoryLength(): number {
    return this.state.nextHistoryId;
  }

  getHistoryEntry(id: number): HistoryEntry | null {
    return this.state.allocationsHistory.get(id) || null;
  }
}

describe("CharityVault", () => {
  let contract: CharityVaultMock;

  beforeEach(() => {
    contract = new CharityVaultMock();
    contract.reset();
  });

  it("initializes buckets successfully", () => {
    const result = contract.initializeBuckets(40, 30, 15, 10, 5);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.numBuckets).toBe(5);
    expect(contract.getBucketBalances("projects")?.allocatedPercent).toBe(40);
  });

  it("rejects bucket initialization with invalid total percent", () => {
    const result = contract.initializeBuckets(40, 30, 15, 10, 6);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PERCENT);
  });

  it("rejects bucket initialization by non-owner", () => {
    contract.caller = "ST2FAKE";
    const result = contract.initializeBuckets(40, 30, 15, 10, 5);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("receives donation and allocates correctly", () => {
    contract.initializeBuckets(40, 30, 15, 10, 5);
    const result = contract.receiveDonation(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getTotalFunds()).toBe(1000);
    expect(contract.getBucketBalances("projects")?.balance).toBe(400);
    expect(contract.getBucketBalances("operations")?.balance).toBe(300);
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "contract" }]);
  });

  it("rejects donation when campaign closed", () => {
    contract.state.isActive = false;
    const result = contract.receiveDonation(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CAMPAIGN_CLOSED);
  });

  it("proposes withdrawal successfully", () => {
    contract.initializeBuckets(40, 30, 15, 10, 5);
    contract.receiveDonation(1000);
    const result = contract.proposeWithdrawal(200, "projects", "ST2RECIP");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const proposal = contract.getProposal(0);
    expect(proposal?.amount).toBe(200);
    expect(proposal?.bucket).toBe("projects");
  });

  it("rejects proposal with insufficient balance", () => {
    contract.initializeBuckets(40, 30, 15, 10, 5);
    const result = contract.proposeWithdrawal(1000, "projects", "ST2RECIP");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_BALANCE);
  });

  it("partially approves proposal without execution", () => {
    contract.initializeBuckets(40, 30, 15, 10, 5);
    contract.receiveDonation(1000);
    contract.proposeWithdrawal(200, "projects", "ST2RECIP");
    const result = contract.approveProposal(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const proposal = contract.getProposal(0);
    expect(proposal?.approvals).toBe(1);
    expect(proposal?.status).toBe(false);
  });

  it("closes campaign successfully", () => {
    const result = contract.closeCampaign();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getCampaignStatus()).toBe(false);
  });

  it("rejects close by non-owner", () => {
    contract.caller = "ST2FAKE";
    const result = contract.closeCampaign();
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets required approvals successfully", () => {
    const result = contract.setRequiredApprovals(3);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.requiredApprovals).toBe(3);
  });

  it("rejects invalid required approvals", () => {
    const result = contract.setRequiredApprovals(6);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_AMOUNT);
  });
});