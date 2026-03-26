/**
 * BountyChain — Mongoose Schemas
 * File: server/models/index.js
 *
 * Collections: users · bounties · submissions
 * All schemas use strict: true and enable timestamps.
 */

const mongoose = require('mongoose');
const { Schema, model } = mongoose;

/* ══════════════════════════════════════════════════════════════════
   USER SCHEMA
   Supports roles: 'hunter' | 'owner' | 'admin'
   Stores rate-limit data server-side (daily submission count)
   bcrypt hash stored; plaintext password NEVER persisted
══════════════════════════════════════════════════════════════════ */
const UserSchema = new Schema(
  {
    /* ── Identity ────────────────────────────────────────────── */
    username: {
      type:      String,
      required:  [true, 'Username is required'],
      unique:    true,
      lowercase: true,
      trim:      true,
      minlength: [3,  'Username must be at least 3 characters'],
      maxlength: [32, 'Username must be at most 32 characters'],
      match:     [/^[a-z0-9._-]+$/, 'Username may only contain lowercase letters, digits, dots, hyphens, and underscores'],
    },

    email: {
      type:     String,
      required: [true, 'Email is required'],
      unique:   true,
      lowercase: true,
      trim:     true,
      match:    [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },

    /* bcrypt hash — NEVER store plaintext */
    passwordHash: {
      type:     String,
      required: true,
      select:   false,   /* Excluded from queries by default */
    },

    /* ── Web3 Identity ───────────────────────────────────────── */
    ens: {
      type:      String,
      unique:    true,
      sparse:    true,   /* Allows multiple null values */
      lowercase: true,
      trim:      true,
      match:     [/\.eth$/, 'ENS domain must end in .eth'],
    },

    walletAddress: {
      type:      String,
      unique:    true,
      sparse:    true,
      lowercase: true,
      trim:      true,
      match:     [/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'],
    },

    /* Display info */
    initials: { type: String, maxlength: 3 },
    avatarUrl: { type: String },   /* Cloudinary URL */
    color:     { type: String, default: '#111820' },
    tcolor:    { type: String, default: '#7df9c0' },

    /* ── Role & Permissions ──────────────────────────────────── */
    role: {
      type:    String,
      enum:    ['hunter', 'owner', 'admin'],
      default: 'hunter',
    },

    /* Admin-specific flag for extra checks beyond role === 'admin' */
    isAdmin: {
      type:    Boolean,
      default: false,
      select:  false,
    },

    /* ── Hunter-Specific Fields ──────────────────────────────── */
    hunter: {
      /* Cumulative earnings in ETH (string to avoid float precision) */
      totalEarned:      { type: String, default: '0' },
      totalSubmissions: { type: Number, default: 0 },
      verifiedWins:     { type: Number, default: 0 },
      reputationScore:  { type: Number, default: 0 },

      /* Server-side rate limiting: { '2026-03-26': 3 } */
      dailySubmissions: {
        type:    Map,
        of:      Number,
        default: {},
      },
    },

    /* ── Owner-Specific Fields ───────────────────────────────── */
    owner: {
      totalBountiesPosted: { type: Number, default: 0 },
      totalEthPosted:      { type: String, default: '0' },
      totalEthPaidOut:     { type: String, default: '0' },
    },

    /* ── Auth / Security ─────────────────────────────────────── */
    /* Refresh token hashes stored here (rotate on use) */
    refreshTokens: {
      type:   [String],
      select: false,
    },

    emailVerified: { type: Boolean, default: false },

    lastLoginAt: { type: Date },

    isBanned: {
      type:    Boolean,
      default: false,
    },

    banReason: { type: String },
  },
  {
    timestamps: true,          /* createdAt + updatedAt */
    strict:     true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.passwordHash;
        delete ret.refreshTokens;
        delete ret.isAdmin;
        return ret;
      },
    },
  }
);

/* ── Indexes ─────────────────────────────────────────────────────── */
UserSchema.index({ username: 1 },      { unique: true });
UserSchema.index({ email: 1 },         { unique: true });
UserSchema.index({ ens: 1 },           { unique: true, sparse: true });
UserSchema.index({ walletAddress: 1 }, { unique: true, sparse: true });
UserSchema.index({ role: 1 });

/* ── Instance method: check daily rate limit ─────────────────────── */
UserSchema.methods.canSubmitToday = function () {
  const today = new Date().toISOString().slice(0, 10);   /* 'YYYY-MM-DD' */
  const count = this.hunter?.dailySubmissions?.get(today) ?? 0;
  return count < 5;
};

UserSchema.methods.incrementDailySubmissions = function () {
  const today = new Date().toISOString().slice(0, 10);
  const current = this.hunter?.dailySubmissions?.get(today) ?? 0;
  this.hunter.dailySubmissions.set(today, current + 1);
};

const User = model('User', UserSchema);


/* ══════════════════════════════════════════════════════════════════
   BOUNTY SCHEMA
   Represents a single on-chain bounty with its metadata and
   media attachments. Media URLs point to Cloudinary / S3.
══════════════════════════════════════════════════════════════════ */

/* Sub-schema for media attachments */
const MediaSchema = new Schema(
  {
    url:      { type: String, required: true },   /* Cloudinary / S3 URL */
    publicId: { type: String },                   /* Cloudinary public_id for deletion */
    type:     { type: String, enum: ['image', 'video'], required: true },
    mimeType: { type: String },                   /* e.g. 'image/png', 'video/mp4' */
    sizeBytes:{ type: Number },
    originalName: { type: String },
  },
  { _id: true }
);

const BountySchema = new Schema(
  {
    /* ── Content ──────────────────────────────────────────────── */
    title: {
      type:      String,
      required:  [true, 'Title / task description is required'],
      trim:      true,
      minlength: [10, 'Title must be at least 10 characters'],
      maxlength: [400, 'Title must be at most 400 characters'],
    },

    description: {
      type:      String,
      trim:      true,
      maxlength: [4000, 'Description must be under 4000 characters'],
    },

    /* Optional code snippet attached by owner */
    codeSnippet: {
      type:      String,
      maxlength: [10000],
    },

    /* Rich media: screenshots, error traces, video walkthroughs */
    media: [MediaSchema],

    /* ── Classification ──────────────────────────────────────── */
    tag: {
      type: String,
      enum: ['Solidity', 'EVM', 'DeFi', 'ZK', 'Gas', 'Rust', 'Hardhat', 'Other'],
      default: 'Other',
    },

    /* ── Reward & Escrow ─────────────────────────────────────── */
    /* Human-readable label, e.g. "0.12 ETH" */
    reward: {
      type:     String,
      required: true,
    },
    /* Raw float for sorting / aggregations */
    rewardRaw: {
      type:     Number,
      required: true,
      min:      [0.001, 'Minimum bounty is 0.001 ETH'],
    },

    /* On-chain smart contract address of this bounty's escrow */
    contractAddress: {
      type:  String,
      match: [/^0x[a-fA-F0-9]{40}$/, 'Invalid contract address'],
    },

    /* ── Status ──────────────────────────────────────────────── */
    status: {
      type:    String,
      enum:    ['open', 'closed', 'disputed', 'cancelled'],
      default: 'open',
    },

    /* ── Relationships ───────────────────────────────────────── */
    creator: {
      type:     Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },

    /* Index of winning solution in the solutions array (denormalized) */
    winningSolutionId: {
      type:    Schema.Types.ObjectId,
      ref:     'Submission',
      default: null,
    },

    /* ── Engagement ──────────────────────────────────────────── */
    views: { type: Number, default: 0 },

    /* Payout tracking */
    payoutTxHash: { type: String },   /* Ethereum tx hash of reward transfer */
    payoutAt:     { type: Date },

    /* Admin force-verify metadata */
    forceVerifiedBy: {
      type: Schema.Types.ObjectId,
      ref:  'User',
    },
    forceVerifiedAt: { type: Date },
  },
  {
    timestamps: true,
    strict:     true,
    toJSON:     { virtuals: true },
  }
);

/* ── Indexes ─────────────────────────────────────────────────────── */
BountySchema.index({ status: 1 });
BountySchema.index({ creator: 1 });
BountySchema.index({ tag: 1 });
BountySchema.index({ rewardRaw: -1 });
BountySchema.index({ createdAt: -1 });
BountySchema.index({ title: 'text', description: 'text' });   /* Full-text search */

const Bounty = model('Bounty', BountySchema);


/* ══════════════════════════════════════════════════════════════════
   SUBMISSION SCHEMA
   A hunter's solution attempt on a specific bounty.
   Media (screenshots, video walkthroughs) stored on Cloudinary/S3.
══════════════════════════════════════════════════════════════════ */
const SubmissionSchema = new Schema(
  {
    /* ── Content ──────────────────────────────────────────────── */
    explanation: {
      type:      String,
      required:  [true, 'Explanation is required'],
      trim:      true,
      minlength: [20,   'Explanation must be at least 20 characters'],
      maxlength: [8000, 'Explanation must be under 8000 characters'],
    },

    codeSnippet: {
      type:      String,
      maxlength: [10000],
    },

    /* Rich media: screenshots, screen-recordings, video walkthroughs */
    media: [MediaSchema],

    /* ── Relationships ───────────────────────────────────────── */
    bounty: {
      type:     Schema.Types.ObjectId,
      ref:      'Bounty',
      required: true,
    },

    solver: {
      type:     Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },

    /* ── Verification ────────────────────────────────────────── */
    verified: {
      type:    Boolean,
      default: false,
    },

    verifiedAt: { type: Date },

    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref:  'User',
    },

    /* Whether this was force-verified by an admin */
    forceVerified: {
      type:    Boolean,
      default: false,
    },

    /* ── Payout ──────────────────────────────────────────────── */
    paidOut: {
      type:    Boolean,
      default: false,
    },

    paidOutAt:    { type: Date },
    payoutTxHash: { type: String },
    payoutAmount: { type: String },   /* ETH amount as string */
  },
  {
    timestamps: true,
    strict:     true,
    toJSON:     { virtuals: true },
  }
);

/* ── Indexes ─────────────────────────────────────────────────────── */
SubmissionSchema.index({ bounty: 1 });
SubmissionSchema.index({ solver: 1 });
SubmissionSchema.index({ bounty: 1, solver: 1 });   /* Compound: submissions per bounty per user */
SubmissionSchema.index({ verified: 1 });
SubmissionSchema.index({ createdAt: -1 });

const Submission = model('Submission', SubmissionSchema);


/* ══════════════════════════════════════════════════════════════════
   EXPORTS
══════════════════════════════════════════════════════════════════ */
module.exports = { User, Bounty, Submission };
