/**
 * BountyChain — Express.js Backend Architecture
 * 
 * File structure this document covers:
 *   server/
 *   ├── index.js              ← Entry point
 *   ├── config/
 *   │   ├── db.js             ← MongoDB connection
 *   │   └── cloudinary.js     ← Cloudinary config
 *   ├── middleware/
 *   │   ├── auth.js           ← JWT verification
 *   │   ├── rateLimit.js      ← Submission rate limiter
 *   │   └── upload.js         ← Multer + Cloudinary pipeline
 *   ├── routes/
 *   │   ├── auth.routes.js    ← /api/auth/*
 *   │   ├── bounty.routes.js  ← /api/bounties/*
 *   │   └── submission.routes.js ← /api/submissions/*
 *   └── models/
 *       └── index.js          ← (see models/index.js file)
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════
   1. server/index.js  — Express Entry Point
══════════════════════════════════════════════════════════════════ */
/*
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const cookieParser = require('cookie-parser');
const mongoose     = require('mongoose');
require('dotenv').config();

const authRoutes       = require('./routes/auth.routes');
const bountyRoutes     = require('./routes/bounty.routes');
const submissionRoutes = require('./routes/submission.routes');

const app = express();

// Security headers
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '10kb' }));        // Limit JSON body size
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Routes
app.use('/api/auth',        authRoutes);
app.use('/api/bounties',    bountyRoutes);
app.use('/api/submissions', submissionRoutes);

// Connect DB + start server
mongoose.connect(process.env.MONGODB_URI)
  .then(() => app.listen(process.env.PORT || 4000,
    () => console.log('BountyChain API running')))
  .catch(err => { console.error(err); process.exit(1); });
*/


/* ══════════════════════════════════════════════════════════════════
   2. config/cloudinary.js  — Cloudinary + multer-storage-cloudinary
══════════════════════════════════════════════════════════════════ */
/*
const cloudinary             = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer                 = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key:    process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

// One storage config that handles both images and videos
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (_req, file) => {
    const isVideo = file.mimetype.startsWith('video/');
    return {
      folder:           'bountychain',
      resource_type:    isVideo ? 'video' : 'image',
      allowed_formats:  isVideo
        ? ['mp4', 'webm', 'mov']
        : ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      // Auto-optimize images; transcode videos to 1080p max
      transformation: isVideo
        ? [{ width: 1920, height: 1080, crop: 'limit', quality: 'auto' }]
        : [{ quality: 'auto:good', fetch_format: 'auto' }],
    };
  },
});

// multer instance: 5 files max, 50 MB each
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg','image/png','image/gif','image/webp',
      'video/mp4','video/webm','video/quicktime',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
  },
});

module.exports = { cloudinary, upload };
*/


/* ══════════════════════════════════════════════════════════════════
   3. middleware/auth.js  — JWT Verification Middleware
══════════════════════════════════════════════════════════════════ */
/*
const jwt  = require('jsonwebtoken');
const { User } = require('../models');

// Verify access token from Authorization: Bearer <token>
exports.requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    // Fetch fresh user from DB (catches banned/deleted users)
    const user = await User.findById(decoded.id).select('+isAdmin');
    if (!user)           return res.status(401).json({ message: 'User not found' });
    if (user.isBanned)   return res.status(403).json({ message: 'Account suspended' });

    req.user = user;
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ message: msg });
  }
};

// Role-gating factory: requireRole('admin') or requireRole('owner', 'admin')
exports.requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Insufficient privileges' });
  }
  next();
};
*/


/* ══════════════════════════════════════════════════════════════════
   4. middleware/rateLimit.js  — Server-Side Daily Submission Cap
   Enforces MAX 5 submissions per hunter per calendar day.
══════════════════════════════════════════════════════════════════ */
/*
const { User } = require('../models');

exports.submissionRateLimit = async (req, res, next) => {
  try {
    // Re-fetch user with dailySubmissions map
    const user = await User.findById(req.user._id);

    if (user.role !== 'hunter') return next();   // Owners/admins exempt

    if (!user.canSubmitToday()) {
      return res.status(429).json({
        message: 'Daily submission limit reached (5/day). Try again tomorrow.',
        retryAfter: '24h',
      });
    }

    // Attach to req so route handler can increment after success
    req.hunterUser = user;
    next();
  } catch (err) {
    next(err);
  }
};
*/


/* ══════════════════════════════════════════════════════════════════
   5. routes/auth.routes.js  — Authentication Endpoints
══════════════════════════════════════════════════════════════════ */
/*
const router  = require('express').Router();
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { User }= require('../models');

const BCRYPT_ROUNDS = 12;

function signAccess(id, role) {
  return jwt.sign({ id, role }, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
}
function signRefresh(id) {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

// ── POST /api/auth/register ──────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, ens, role } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ message: 'username, email and password are required' });

    if (password.length < 8)
      return res.status(400).json({ message: 'Password must be at least 8 characters' });

    const hash  = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user  = await User.create({
      username, email, passwordHash: hash, ens: ens || undefined,
      role: ['hunter','owner'].includes(role) ? role : 'hunter',
    });

    const access  = signAccess(user._id, user.role);
    const refresh = signRefresh(user._id);
    user.refreshTokens.push(await bcrypt.hash(refresh, 6));
    await user.save();

    res.cookie('refreshToken', refresh, {
      httpOnly: true, secure: true, sameSite: 'Strict', maxAge: 7 * 86400 * 1000,
    });
    res.status(201).json({ token: access, user: user.toJSON() });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(409).json({ message: `${field} already in use` });
    }
    res.status(500).json({ message: 'Registration failed', error: err.message });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'username and password are required' });

    // ── ADMIN OVERRIDE ──────────────────────────────────────────
    // Credentials verified server-side (not just client-side).
    // In production replace with a proper admin account in the DB.
    if (username === process.env.ADMIN_USERNAME &&
        password === process.env.ADMIN_PASSWORD) {
      const adminToken = jwt.sign(
        { id: 'admin', role: 'admin', isAdmin: true },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: '8h' }
      );
      return res.json({
        token: adminToken,
        user:  { username: 'admin', role: 'admin', isAdmin: true },
      });
    }
    // ────────────────────────────────────────────────────────────

    const user = await User.findOne({ username }).select('+passwordHash +refreshTokens');
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    if (user.isBanned) return res.status(403).json({ message: 'Account suspended' });

    user.lastLoginAt = new Date();
    const access  = signAccess(user._id, user.role);
    const refresh = signRefresh(user._id);
    user.refreshTokens.push(await bcrypt.hash(refresh, 6));
    // Keep only last 5 refresh tokens per user
    if (user.refreshTokens.length > 5) user.refreshTokens.shift();
    await user.save();

    res.cookie('refreshToken', refresh, {
      httpOnly: true, secure: true, sameSite: 'Strict', maxAge: 7 * 86400 * 1000,
    });
    res.json({ token: access, user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
});

// ── POST /api/auth/refresh ───────────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies.refreshToken;
    if (!token) return res.status(401).json({ message: 'No refresh token' });

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user    = await User.findById(decoded.id).select('+refreshTokens');
    if (!user)  return res.status(401).json({ message: 'User not found' });

    // Validate refresh token hash
    const valid = await Promise.any(
      user.refreshTokens.map(h => bcrypt.compare(token, h))
    ).catch(() => false);
    if (!valid) return res.status(401).json({ message: 'Invalid refresh token' });

    const newAccess  = signAccess(user._id, user.role);
    const newRefresh = signRefresh(user._id);

    // Rotate: remove old hash, add new
    user.refreshTokens = user.refreshTokens.filter(async h =>
      !(await bcrypt.compare(token, h))
    );
    user.refreshTokens.push(await bcrypt.hash(newRefresh, 6));
    await user.save();

    res.cookie('refreshToken', newRefresh, {
      httpOnly: true, secure: true, sameSite: 'Strict', maxAge: 7 * 86400 * 1000,
    });
    res.json({ token: newAccess });
  } catch {
    res.status(401).json({ message: 'Refresh failed' });
  }
});

// ── POST /api/auth/logout ────────────────────────────────────────
router.post('/logout', async (req, res) => {
  res.clearCookie('refreshToken');
  res.json({ message: 'Logged out' });
});

module.exports = router;
*/


/* ══════════════════════════════════════════════════════════════════
   6. routes/bounty.routes.js  — Bounty CRUD + Media Upload
══════════════════════════════════════════════════════════════════ */
/*
const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { upload }  = require('../config/cloudinary');
const { Bounty, Submission } = require('../models');

// GET /api/bounties — Public: list open bounties
router.get('/', async (req, res) => {
  try {
    const { tag, status = 'open', sort = '-createdAt', page = 1, limit = 20, q } = req.query;
    const filter = { status };
    if (tag) filter.tag = tag;
    if (q)   filter.$text = { $search: q };

    const bounties = await Bounty.find(filter)
      .populate('creator', 'username ens initials color tcolor')
      .sort(sort)
      .skip((page - 1) * +limit)
      .limit(+limit)
      .lean();

    const total = await Bounty.countDocuments(filter);
    res.json({ bounties, total, page: +page });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/bounties — Owner only; accepts up to 5 media files
router.post('/',
  requireAuth,
  requireRole('owner', 'admin'),
  upload.array('media', 5),          // multer uploads to Cloudinary
  async (req, res) => {
    try {
      const { title, description, codeSnippet, tag, reward, rewardRaw } = req.body;

      // Map multer-cloudinary file objects to our MediaSchema shape
      const media = (req.files || []).map(f => ({
        url:          f.path,           // Cloudinary secure URL
        publicId:     f.filename,       // Cloudinary public_id
        type:         f.mimetype.startsWith('video/') ? 'video' : 'image',
        mimeType:     f.mimetype,
        sizeBytes:    f.size,
        originalName: f.originalname,
      }));

      const bounty = await Bounty.create({
        title, description, codeSnippet, tag,
        reward, rewardRaw: parseFloat(rewardRaw),
        media,
        creator: req.user._id,
      });

      // Increment owner stats
      await req.user.updateOne({
        $inc: {
          'owner.totalBountiesPosted': 1,
          'owner.totalEthPosted': parseFloat(rewardRaw),
        },
      });

      res.status(201).json({ bounty });
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  }
);

// POST /api/bounties/:id/force-verify — Admin only
router.post('/:id/force-verify',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { submissionId } = req.body;

      const bounty = await Bounty.findById(req.params.id);
      if (!bounty)        return res.status(404).json({ message: 'Bounty not found' });
      if (bounty.status !== 'open')
        return res.status(400).json({ message: 'Bounty is already closed' });

      const submission = await Submission.findById(submissionId);
      if (!submission)   return res.status(404).json({ message: 'Submission not found' });

      submission.verified      = true;
      submission.verifiedAt    = new Date();
      submission.verifiedBy    = req.user._id;
      submission.forceVerified = true;
      submission.paidOut       = true;       // Trigger payout flag
      submission.paidOutAt     = new Date();
      submission.payoutAmount  = bounty.reward;
      await submission.save();

      bounty.status             = 'closed';
      bounty.winningSolutionId  = submission._id;
      bounty.forceVerifiedBy    = req.user._id;
      bounty.forceVerifiedAt    = new Date();
      await bounty.save();

      // In production: trigger smart contract call here via ethers.js
      // await relayer.triggerPayout(bounty.contractAddress, submission.solver);

      res.json({ message: 'Force verified and payout triggered', bounty, submission });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

module.exports = router;
*/


/* ══════════════════════════════════════════════════════════════════
   7. routes/submission.routes.js  — Submit Solution + Media Upload
══════════════════════════════════════════════════════════════════ */
/*
const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { submissionRateLimit }       = require('../middleware/rateLimit');
const { upload }   = require('../config/cloudinary');
const { Bounty, Submission } = require('../models');

// POST /api/submissions — Hunter only; rate-limited; accepts media
router.post('/',
  requireAuth,
  requireRole('hunter'),
  submissionRateLimit,                 // 5 per day check
  upload.array('media', 5),           // Up to 5 files (images + video)
  async (req, res) => {
    try {
      const { bountyId, explanation, codeSnippet } = req.body;

      const bounty = await Bounty.findById(bountyId);
      if (!bounty)           return res.status(404).json({ message: 'Bounty not found' });
      if (bounty.status !== 'open')
        return res.status(400).json({ message: 'This bounty is no longer open' });

      // Prevent duplicate submissions from same hunter on same bounty
      const existing = await Submission.findOne({ bounty: bountyId, solver: req.user._id });
      if (existing)
        return res.status(409).json({ message: 'You have already submitted a solution for this bounty' });

      const media = (req.files || []).map(f => ({
        url:          f.path,
        publicId:     f.filename,
        type:         f.mimetype.startsWith('video/') ? 'video' : 'image',
        mimeType:     f.mimetype,
        sizeBytes:    f.size,
        originalName: f.originalname,
      }));

      const submission = await Submission.create({
        bounty:      bountyId,
        solver:      req.user._id,
        explanation,
        codeSnippet: codeSnippet || undefined,
        media,
      });

      // Increment rate-limit counter
      req.hunterUser.incrementDailySubmissions();
      req.hunterUser.hunter.totalSubmissions += 1;
      await req.hunterUser.save();

      res.status(201).json({ submission });
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  }
);

// GET /api/submissions/my — Hunter: fetch own submissions
router.get('/my', requireAuth, requireRole('hunter', 'admin'), async (req, res) => {
  try {
    const submissions = await Submission.find({ solver: req.user._id })
      .populate('bounty', 'title reward tag status')
      .sort('-createdAt')
      .lean();
    res.json({ submissions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
*/


/* ══════════════════════════════════════════════════════════════════
   8. .env  — Required Environment Variables
══════════════════════════════════════════════════════════════════ */
/*
PORT=4000
CLIENT_URL=http://localhost:3000
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/bountychain

# JWT — generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_ACCESS_SECRET=<64-byte-hex>
JWT_REFRESH_SECRET=<64-byte-hex>

# Admin override credentials (stored server-side only)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin@2108

# Cloudinary
CLOUDINARY_NAME=your_cloud_name
CLOUDINARY_KEY=your_api_key
CLOUDINARY_SECRET=your_api_secret
*/


/* ══════════════════════════════════════════════════════════════════
   9. package.json  — Required npm packages
══════════════════════════════════════════════════════════════════ */
/*
{
  "dependencies": {
    "express":                    "^4.21",
    "mongoose":                   "^8.x",
    "bcrypt":                     "^5.x",
    "jsonwebtoken":               "^9.x",
    "cloudinary":                 "^2.x",
    "multer":                     "^1.x",
    "multer-storage-cloudinary":  "^4.x",
    "helmet":                     "^7.x",
    "cors":                       "^2.x",
    "cookie-parser":              "^1.x",
    "dotenv":                     "^16.x"
  },
  "devDependencies": {
    "nodemon": "^3.x"
  }
}
*/

module.exports = {};  // Placeholder export so Node won't throw
