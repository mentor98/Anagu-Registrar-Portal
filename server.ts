import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import {
  ANAGU_TOKEN_ABI,
  CONTRACT_ADDRESSES,
  LAND_REGISTRY_ABI,
  LAND_TITLE_NFT_ABI,
  POLYGON_AMOY_CHAIN_ID,
  POLYGON_AMOY_RPC_URLS,
  REGISTRAR_ROLE_HASH,
  SUPABASE_URL,
  buildParcelMetadataUri,
  keccakId,
} from './src/lib/contracts.ts';

const PORT = Number(process.env.PORT || 3000);
const SUPABASE_BASE_URL = process.env.SUPABASE_URL || SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';

const STAFF_AUTH_SECRET =
  process.env.STAFF_AUTH_SECRET ||
  crypto.createHash('sha256').update(`${SUPABASE_BASE_URL}:anagu-registrar-portal-session`).digest('hex');

const TOKEN_TTL_SECONDS = 12 * 60 * 60; // 12 hours

interface StaffAccountRow {
  id: string;
  staff_id: string;
  role: string;
  full_name: string;
  email?: string | null;
  passcode_hash: string;
  jurisdiction?: string | null;
  state_name?: string | null;
  lga_name?: string | null;
  wallet_address?: string | null;
  is_active: boolean;
  last_login_at?: string | null;
}

interface AuthenticatedRequest extends Request {
  registrar?: Omit<StaffAccountRow, 'passcode_hash'>;
}

function getSupabaseClient(): SupabaseClient {
  if (!SUPABASE_KEY) {
    throw Object.assign(
      new Error('Supabase credentials are not configured. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY in your environment.'),
      { statusCode: 503, code: 'SUPABASE_NOT_CONFIGURED' }
    );
  }
  return createClient(SUPABASE_BASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Salted scrypt verification supporting common formats:
// 1. "<salt>:<hex_or_base64_hash>"
// 2. "$scrypt$N$r$p$<salt>$<hash>" or "scrypt$<salt>$<hash>"
function verifyScryptPasscode(passcode: string, storedHash: string): boolean {
  if (!passcode || !storedHash) return false;

  try {
    let salt = '';
    let expectedRaw = '';
    let N = 16384;
    let r = 8;
    let p = 1;

    if (storedHash.startsWith('$scrypt$') || storedHash.startsWith('scrypt$')) {
      const parts = storedHash.replace(/^\$/, '').split('$');
      if (parts.length === 3) {
        [, salt, expectedRaw] = parts;
      } else if (parts.length >= 6) {
        // scrypt$N$r$p$salt$hash
        N = Number(parts[1]) || 16384;
        r = Number(parts[2]) || 8;
        p = Number(parts[3]) || 1;
        salt = parts[4];
        expectedRaw = parts[5];
      }
    } else if (storedHash.includes(':')) {
      const idx = storedHash.indexOf(':');
      salt = storedHash.slice(0, idx);
      expectedRaw = storedHash.slice(idx + 1);
    }

    if (!salt || !expectedRaw) return false;

    const isHex = /^[0-9a-fA-F]+$/.test(expectedRaw);
    const expectedBuf = isHex
      ? Buffer.from(expectedRaw, 'hex')
      : Buffer.from(expectedRaw, 'base64');

    if (expectedBuf.length === 0) return false;

    const derived = crypto.scryptSync(passcode, salt, expectedBuf.length, { N, r, p });
    if (derived.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derived, expectedBuf);
  } catch {
    return false;
  }
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

interface SessionPayload {
  sub: string;
  staff_id: string;
  role: string;
  full_name: string;
  iat: number;
  exp: number;
}

function signSessionToken(staff: StaffAccountRow): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload: SessionPayload = {
    sub: staff.id,
    staff_id: staff.staff_id,
    role: staff.role,
    full_name: staff.full_name,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${header}.${encodedPayload}`;
  const sig = base64UrlEncode(
    crypto.createHmac('sha256', STAFF_AUTH_SECRET).update(data).digest()
  );
  return `${data}.${sig}`;
}

function verifySessionToken(token: string): SessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, encodedPayload, sig] = parts;
    const data = `${header}.${encodedPayload}`;
    const expectedSig = base64UrlEncode(
      crypto.createHmac('sha256', STAFF_AUTH_SECRET).update(data).digest()
    );
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) return null;
    if (payload.role !== 'registrar') return null;
    return payload;
  } catch {
    return null;
  }
}

async function requireRegistrar(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Authentication required. Please sign in with your Registrar Staff ID.' });
      return;
    }

    const payload = verifySessionToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
      return;
    }

    const supabase = getSupabaseClient();
    const { data: staff, error } = await supabase
      .from('staff_accounts')
      .select('id, staff_id, role, full_name, email, jurisdiction, state_name, lga_name, wallet_address, is_active, last_login_at')
      .eq('id', payload.sub)
      .maybeSingle();

    if (error) {
      res.status(502).json({ error: `Failed to verify registrar session: ${error.message}` });
      return;
    }

    if (!staff || staff.role !== 'registrar' || !staff.is_active) {
      res.status(403).json({ error: 'Access denied. Registrar role is inactive or revoked.' });
      return;
    }

    req.registrar = staff;
    next();
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode || 500;
    res.status(status).json({ error: (err as Error).message });
  }
}

function getOrderedRpcUrls(): string[] {
  const custom = process.env.POLYGON_AMOY_RPC_URL?.trim();
  const base = [...POLYGON_AMOY_RPC_URLS];
  if (custom && !base.includes(custom as (typeof POLYGON_AMOY_RPC_URLS)[number])) {
    return [custom, ...base];
  }
  return base;
}

async function withAmoyProvider<T>(fn: (provider: ethers.JsonRpcProvider, rpcUrl: string) => Promise<T>): Promise<T> {
  const urls = getOrderedRpcUrls();
  let lastError: unknown = null;

  for (const rpcUrl of urls) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl, POLYGON_AMOY_CHAIN_ID, {
        staticNetwork: true,
        batchMaxCount: 1,
      });
      return await fn(provider, rpcUrl);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('All Polygon Amoy RPC endpoints failed.');
}

async function writeAuditLog(
  supabase: SupabaseClient,
  params: {
    staff?: Omit<StaffAccountRow, 'passcode_hash'>;
    action: string;
    entityType: string;
    entityId?: string | null;
    parcelId?: string | null;
    txHash?: string | null;
    details?: Record<string, unknown>;
  }
) {
  try {
    await supabase.from('audit_logs').insert({
      actor_id: params.staff?.id || null,
      actor_staff_id: params.staff?.staff_id || null,
      actor_role: params.staff?.role || 'registrar',
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId || null,
      parcel_id: params.parcelId || null,
      tx_hash: params.txHash || null,
      details: params.details || {},
    });
  } catch {
    // Non-blocking audit log fallback if schema columns differ slightly
  }
}

function extractGeoJson(parcel: Record<string, unknown>): Record<string, unknown> | null {
  if (parcel.geojson && typeof parcel.geojson === 'object') {
    return parcel.geojson as Record<string, unknown>;
  }
  if (parcel.geom && typeof parcel.geom === 'object' && 'type' in parcel.geom && 'coordinates' in parcel.geom) {
    return parcel.geom as Record<string, unknown>;
  }
  if (Array.isArray(parcel.boundary_coordinates) && parcel.boundary_coordinates.length >= 3) {
    const ring = (parcel.boundary_coordinates as Array<[number, number]>).map(([lat, lng]) => [lng, lat]);
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([...first]);
    }
    return {
      type: 'Polygon',
      coordinates: [ring],
    };
  }
  return null;
}

function computePolygonMetrics(geojson: Record<string, unknown> | null): {
  centroid: { lat: number; lng: number } | null;
  areaSqm: number | null;
  spatialHash: string | null;
} {
  if (!geojson || !Array.isArray(geojson.coordinates)) {
    return { centroid: null, areaSqm: null, spatialHash: null };
  }

  let ring: number[][] = [];
  if (geojson.type === 'Polygon') {
    ring = (geojson.coordinates as number[][][])[0] || [];
  } else if (geojson.type === 'MultiPolygon') {
    ring = (geojson.coordinates as number[][][][])[0]?.[0] || [];
  }

  if (ring.length < 3) {
    return { centroid: null, areaSqm: null, spatialHash: null };
  }

  let sumLng = 0;
  let sumLat = 0;
  const count = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.length - 1
    : ring.length;

  for (let i = 0; i < count; i++) {
    sumLng += Number(ring[i][0]);
    sumLat += Number(ring[i][1]);
  }
  const centroidLat = sumLat / count;
  const centroidLng = sumLng / count;

  // Approximate planar area in sqm using equirectangular projection at centroid latitude
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((centroidLat * Math.PI) / 180);
  let shoelace = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const x1 = ring[i][0] * metersPerDegLng;
    const y1 = ring[i][1] * metersPerDegLat;
    const x2 = ring[i + 1][0] * metersPerDegLng;
    const y2 = ring[i + 1][1] * metersPerDegLat;
    shoelace += x1 * y2 - x2 * y1;
  }
  const areaSqm = Math.round(Math.abs(shoelace / 2) * 100) / 100;
  const spatialHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(geojson)));

  return {
    centroid: { lat: Number(centroidLat.toFixed(6)), lng: Number(centroidLng.toFixed(6)) },
    areaSqm,
    spatialHash,
  };
}

function geoJsonToWkt(geojson: Record<string, unknown>): string | null {
  if (geojson.type === 'Polygon' && Array.isArray(geojson.coordinates)) {
    const rings = (geojson.coordinates as number[][][]).map(
      (ring) => `(${ring.map((pt) => `${pt[0]} ${pt[1]}`).join(', ')})`
    );
    return `SRID=4326;POLYGON(${rings.join(', ')})`;
  }
  if (geojson.type === 'MultiPolygon' && Array.isArray(geojson.coordinates)) {
    const polys = (geojson.coordinates as number[][][][]).map(
      (poly) =>
        `(${poly
          .map((ring) => `(${ring.map((pt) => `${pt[0]} ${pt[1]}`).join(', ')})`)
          .join(', ')})`
    );
    return `SRID=4326;MULTIPOLYGON(${polys.join(', ')})`;
  }
  return null;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // Health probe
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'anagu-registrar-portal',
      supabaseConfigured: Boolean(SUPABASE_KEY),
      chainId: POLYGON_AMOY_CHAIN_ID,
    });
  });

  // =========================================================================
  // 1. STAFF AUTHENTICATION ROUTES
  // =========================================================================
  app.post('/api/staff/login', async (req: Request, res: Response) => {
    try {
      const rawStaffId = String(req.body?.staffId || '').trim().toUpperCase();
      const passcode = String(req.body?.passcode || '');

      if (!/^REG-[A-Z0-9]{3,16}$/.test(rawStaffId)) {
        res.status(400).json({ error: 'Invalid Staff ID format. Expected format: REG-XXXX (e.g. REG-1042).' });
        return;
      }
      if (!passcode) {
        res.status(400).json({ error: 'Assigned passcode is required.' });
        return;
      }

      const supabase = getSupabaseClient();
      const { data: staff, error } = await supabase
        .from('staff_accounts')
        .select('*')
        .eq('staff_id', rawStaffId)
        .maybeSingle<StaffAccountRow>();

      if (error) {
        res.status(502).json({ error: `Supabase authentication lookup failed: ${error.message}` });
        return;
      }

      if (!staff) {
        res.status(401).json({ error: 'Invalid Registrar Staff ID or passcode.' });
        return;
      }

      if (staff.role !== 'registrar') {
        res.status(403).json({
          error: `Access denied. Staff ID ${rawStaffId} is assigned role "${staff.role}", not "registrar".`,
        });
        return;
      }

      if (!staff.is_active) {
        res.status(403).json({
          error: `Staff ID ${rawStaffId} is currently suspended. Contact the ANAGU System Administrator.`,
        });
        return;
      }

      const validPasscode = verifyScryptPasscode(passcode, staff.passcode_hash);
      if (!validPasscode) {
        await writeAuditLog(supabase, {
          staff: { ...staff },
          action: 'STAFF_LOGIN_FAILED',
          entityType: 'staff_accounts',
          entityId: staff.id,
          details: { staff_id: staff.staff_id, reason: 'invalid_passcode' },
        });
        res.status(401).json({ error: 'Invalid Registrar Staff ID or passcode.' });
        return;
      }

      const nowIso = new Date().toISOString();
      await supabase
        .from('staff_accounts')
        .update({ last_login_at: nowIso })
        .eq('id', staff.id);

      const token = signSessionToken(staff);
      const { passcode_hash: _omitted, ...safeProfile } = staff;
      safeProfile.last_login_at = nowIso;

      await writeAuditLog(supabase, {
        staff: safeProfile,
        action: 'STAFF_LOGIN',
        entityType: 'staff_accounts',
        entityId: staff.id,
        details: { staff_id: staff.staff_id, jurisdiction: staff.jurisdiction },
      });

      res.json({
        token,
        expiresInSeconds: TOKEN_TTL_SECONDS,
        staff: safeProfile,
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: (err as Error).message });
    }
  });

  app.get('/api/registrar/me', requireRegistrar, (req: AuthenticatedRequest, res: Response) => {
    res.json({ staff: req.registrar });
  });

  app.post('/api/staff/logout', requireRegistrar, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const supabase = getSupabaseClient();
      await writeAuditLog(supabase, {
        staff: req.registrar,
        action: 'STAFF_LOGOUT',
        entityType: 'staff_accounts',
        entityId: req.registrar?.id,
      });
    } catch {
      // Best-effort log
    }
    res.json({ ok: true });
  });

  // =========================================================================
  // 2. POLYGON AMOY BLOCKCHAIN PROXY ROUTES
  // =========================================================================
  app.get('/api/blockchain/status', async (_req: Request, res: Response) => {
    try {
      const result = await withAmoyProvider(async (provider, rpcUrl) => {
        const registry = new ethers.Contract(CONTRACT_ADDRESSES.LandRegistry, LAND_REGISTRY_ABI, provider);
        const token = new ethers.Contract(CONTRACT_ADDRESSES.ANAGUToken, ANAGU_TOKEN_ABI, provider);

        const [
          blockNumber,
          regFee,
          xferFee,
          titlesIssued,
          transfersCompleted,
          totalFeesCollected,
          treasury,
          decimals,
        ] = await Promise.all([
          provider.getBlockNumber(),
          registry.fees(0),
          registry.fees(1),
          registry.titlesIssued(),
          registry.transfersCompleted(),
          registry.totalFeesCollected(),
          registry.treasury(),
          token.decimals(),
        ]);

        const dec = Number(decimals);
        return {
          chainId: POLYGON_AMOY_CHAIN_ID,
          blockNumber,
          rpcUrl,
          registrationFeeWei: regFee.toString(),
          registrationFeeFormatted: ethers.formatUnits(regFee, dec),
          transferFeeWei: xferFee.toString(),
          transferFeeFormatted: ethers.formatUnits(xferFee, dec),
          titlesIssued: titlesIssued.toString(),
          transfersCompleted: transfersCompleted.toString(),
          totalFeesCollectedWei: totalFeesCollected.toString(),
          totalFeesCollectedFormatted: ethers.formatUnits(totalFeesCollected, dec),
          treasury,
        };
      });
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: `Polygon Amoy RPC error: ${(err as Error).message}` });
    }
  });

  app.get('/api/blockchain/wallet/:address', async (req: Request, res: Response) => {
    try {
      const address = String(req.params.address || '').trim();
      if (!ethers.isAddress(address)) {
        res.status(400).json({ error: 'Invalid Ethereum wallet address.' });
        return;
      }

      const result = await withAmoyProvider(async (provider) => {
        const token = new ethers.Contract(CONTRACT_ADDRESSES.ANAGUToken, ANAGU_TOKEN_ABI, provider);
        const registry = new ethers.Contract(CONTRACT_ADDRESSES.LandRegistry, LAND_REGISTRY_ABI, provider);

        const [polBalance, anaguBalance, allowance, decimals, hasRegistrarRole] = await Promise.all([
          provider.getBalance(address),
          token.balanceOf(address),
          token.allowance(address, CONTRACT_ADDRESSES.LandRegistry),
          token.decimals(),
          registry.hasRole(REGISTRAR_ROLE_HASH, address),
        ]);

        const dec = Number(decimals);
        return {
          address: ethers.getAddress(address),
          polBalanceWei: polBalance.toString(),
          polBalanceFormatted: Number(ethers.formatEther(polBalance)).toFixed(4),
          anaguBalanceWei: anaguBalance.toString(),
          anaguBalanceFormatted: Number(ethers.formatUnits(anaguBalance, dec)).toFixed(2),
          anaguAllowanceWei: allowance.toString(),
          anaguAllowanceFormatted: ethers.formatUnits(allowance, dec),
          hasRegistrarRole: Boolean(hasRegistrarRole),
          decimals: dec,
        };
      });

      res.json(result);
    } catch (err) {
      res.status(502).json({ error: `Failed to query wallet on Polygon Amoy: ${(err as Error).message}` });
    }
  });

  app.get('/api/blockchain/application/:applicationId', async (req: Request, res: Response) => {
    try {
      const applicationId = String(req.params.applicationId || '').trim();
      if (!applicationId) {
        res.status(400).json({ error: 'Application ID is required.' });
        return;
      }
      const appBytes = keccakId(applicationId);

      const result = await withAmoyProvider(async (provider) => {
        const registry = new ethers.Contract(CONTRACT_ADDRESSES.LandRegistry, LAND_REGISTRY_ABI, provider);
        const [processed, regFee, transferFee] = await Promise.all([
          registry.applicationProcessed(appBytes),
          registry.fees(0),
          registry.fees(1),
        ]);
        return {
          applicationId,
          applicationBytes32: appBytes,
          processed: Boolean(processed),
          registrationFeeWei: regFee.toString(),
          transferFeeWei: transferFee.toString(),
        };
      });

      res.json(result);
    } catch (err) {
      res.status(502).json({ error: `Failed to inspect application on-chain: ${(err as Error).message}` });
    }
  });

  app.get('/api/blockchain/token/:tokenId', async (req: Request, res: Response) => {
    try {
      const tokenId = String(req.params.tokenId || '').trim();
      if (!/^\d+$/.test(tokenId)) {
        res.status(400).json({ error: 'Invalid numeric tokenId.' });
        return;
      }

      const result = await withAmoyProvider(async (provider) => {
        const nft = new ethers.Contract(CONTRACT_ADDRESSES.LandTitleNFT, LAND_TITLE_NFT_ABI, provider);
        const [owner, titleData, isRevoked, revocationGround, revokedAt, tokenUri] = await Promise.all([
          nft.ownerOf(tokenId),
          nft.titles(tokenId),
          nft.isRevoked(tokenId),
          nft.revocationGround(tokenId),
          nft.revokedAt(tokenId),
          nft.tokenURI(tokenId),
        ]);

        return {
          tokenId,
          owner,
          parcelIdHash: titleData.parcelId,
          spatialHash: titleData.spatialHash,
          applicationIdHash: titleData.applicationId,
          issuedAt: Number(titleData.issuedAt),
          uri: tokenUri || titleData.uri,
          isRevoked: Boolean(isRevoked),
          revocationGround: Number(revocationGround),
          revokedAt: Number(revokedAt),
        };
      });

      res.json(result);
    } catch (err) {
      res.status(502).json({ error: `Failed to query LandTitleNFT #${req.params.tokenId}: ${(err as Error).message}` });
    }
  });

  app.get('/api/blockchain/tx/:txHash', async (req: Request, res: Response) => {
    try {
      const txHash = String(req.params.txHash || '').trim();
      if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
        res.status(400).json({ error: 'Invalid transaction hash format (expected 0x + 64 hex chars).' });
        return;
      }

      const inspection = await withAmoyProvider(async (provider) => {
        const [tx, receipt] = await Promise.all([
          provider.getTransaction(txHash),
          provider.getTransactionReceipt(txHash),
        ]);

        if (!tx && !receipt) {
          return {
            txHash,
            found: false,
            confirmed: false,
            status: 'NOT_FOUND' as const,
            decodedEvents: [],
          };
        }

        if (tx && !receipt) {
          return {
            txHash,
            found: true,
            confirmed: false,
            status: 'PENDING' as const,
            from: tx.from,
            to: tx.to || undefined,
            valuePol: ethers.formatEther(tx.value),
            decodedEvents: [],
          };
        }

        const block = receipt?.blockNumber ? await provider.getBlock(receipt.blockNumber) : null;
        const currentBlock = await provider.getBlockNumber();

        const tokenIface = new ethers.Interface(ANAGU_TOKEN_ABI);
        const registryIface = new ethers.Interface(LAND_REGISTRY_ABI);
        const nftIface = new ethers.Interface(LAND_TITLE_NFT_ABI);

        const decodedEvents: Array<{
          contract: string;
          eventName: string;
          args: Record<string, string>;
        }> = [];

        for (const log of receipt?.logs || []) {
          const addr = log.address.toLowerCase();
          try {
            let parsed: ethers.LogDescription | null = null;
            let contractLabel = addr;

            if (addr === CONTRACT_ADDRESSES.ANAGUToken.toLowerCase()) {
              parsed = tokenIface.parseLog(log);
              contractLabel = 'ANAGUToken';
            } else if (addr === CONTRACT_ADDRESSES.LandRegistry.toLowerCase()) {
              parsed = registryIface.parseLog(log);
              contractLabel = 'LandRegistry';
            } else if (addr === CONTRACT_ADDRESSES.LandTitleNFT.toLowerCase()) {
              parsed = nftIface.parseLog(log);
              contractLabel = 'LandTitleNFT';
            }

            if (parsed) {
              const argsObj: Record<string, string> = {};
              parsed.fragment.inputs.forEach((input, idx) => {
                const rawVal = parsed!.args[idx];
                argsObj[input.name || `arg${idx}`] = rawVal?.toString?.() ?? String(rawVal);
              });
              decodedEvents.push({
                contract: contractLabel,
                eventName: parsed.name,
                args: argsObj,
              });
            }
          } catch {
            // Skip unrelated logs
          }
        }

        return {
          txHash,
          found: true,
          confirmed: true,
          status: receipt?.status === 1 ? ('SUCCESS' as const) : ('REVERTED' as const),
          blockNumber: receipt?.blockNumber,
          confirmations: receipt?.blockNumber ? Math.max(1, currentBlock - receipt.blockNumber + 1) : 0,
          from: receipt?.from || tx?.from,
          to: receipt?.to || tx?.to || undefined,
          valuePol: tx ? ethers.formatEther(tx.value) : '0',
          gasUsed: receipt?.gasUsed?.toString(),
          timestamp: block?.timestamp,
          decodedEvents,
        };
      });

      res.json(inspection);
    } catch (err) {
      res.status(502).json({ error: `Failed to inspect transaction: ${(err as Error).message}` });
    }
  });

  // =========================================================================
  // 3. REGISTRAR WORKSPACE DATA ROUTES (Protected by requireRegistrar)
  // =========================================================================

  app.get('/api/registrar/overview', requireRegistrar, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const supabase = getSupabaseClient();
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [
        parcelsRes,
        gisChecksRes,
        txRes,
        auditRes,
        settingsRes,
        ticketsRes,
      ] = await Promise.all([
        supabase.from('parcels').select('*').order('created_at', { ascending: false }).limit(200),
        supabase
          .from('audit_logs')
          .select('id', { count: 'exact', head: true })
          .eq('action', 'GIS_OVERLAP_CHECK')
          .gte('created_at', startOfDay.toISOString()),
        supabase.from('wallet_transactions').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(15),
        supabase.from('system_settings').select('*'),
        supabase.from('support_tickets').select('id, status').eq('status', 'open'),
      ]);

      if (parcelsRes.error) {
        res.status(502).json({ error: `Failed to fetch parcels: ${parcelsRes.error.message}` });
        return;
      }

      const parcels = parcelsRes.data || [];
      const pendingQueue = parcels.filter((p) => p.status === 'pending_audit' || p.status === 'under_review');
      const verifiedParcels = parcels.filter((p) => p.status === 'verified');
      const disputedParcels = parcels.filter((p) => p.status === 'disputed');
      const governorPending = parcels.filter(
        (p) => p.governor_consent_status === 'GOVERNOR_CONSENT_PENDING'
      );

      const transactions = txRes.data || [];
      const anaguCollectedDb = transactions
        .filter(
          (t) =>
            (t.token_symbol || 'ANAGU').toUpperCase() === 'ANAGU' &&
            (t.status === 'confirmed' || t.status === 'reconciled' || t.reconciled)
        )
        .reduce((acc, t) => acc + Number(t.amount || 0), 0);

      let governorConsentThresholdUsd = 100000;
      for (const s of settingsRes.data || []) {
        if (s.key === 'workflow_rules' && s.value?.governorConsentThresholdUsd != null) {
          governorConsentThresholdUsd = Number(s.value.governorConsentThresholdUsd);
        } else if (s.workflow_rules?.governorConsentThresholdUsd != null) {
          governorConsentThresholdUsd = Number(s.workflow_rules.governorConsentThresholdUsd);
        }
      }

      res.json({
        stats: {
          pendingApplications: pendingQueue.length,
          gisChecksToday: gisChecksRes.count || 0,
          verifiedParcels: verifiedParcels.length,
          disputedParcels: disputedParcels.length,
          governorConsentPending: governorPending.length,
          openDisputeTickets: ticketsRes.data?.length || 0,
          anaguFeesCollectedDb: anaguCollectedDb,
          governorConsentThresholdUsd,
        },
        pendingQueue: pendingQueue.slice(0, 12),
        recentActivity: auditRes.data || [],
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: (err as Error).message });
    }
  });

  app.get('/api/registrar/notifications', requireRegistrar, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const supabase = getSupabaseClient();
      const [pendingParcelsRes, ticketsRes, pendingDocsRes] = await Promise.all([
        supabase
          .from('parcels')
          .select('id, parcel_id, parcel_code, title, status, governor_consent_status, created_at')
          .in('status', ['pending_audit', 'disputed'])
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('support_tickets')
          .select('id, parcel_id, subject, status, priority, created_at')
          .in('status', ['open', 'in_progress'])
          .order('created_at', { ascending: false })
          .limit(6),
        supabase
          .from('statutory_documents')
          .select('id, parcel_id, document_type, review_status, created_at')
          .or('review_status.is.null,review_status.eq.PENDING')
          .order('created_at', { ascending: false })
          .limit(6),
      ]);

      const alerts: Array<{
        id: string;
        category: string;
        title: string;
        description: string;
        parcelId?: string;
        createdAt?: string | null;
      }> = [];

      for (const p of pendingParcelsRes.data || []) {
        const code = p.parcel_code || p.parcel_id || p.id.slice(0, 8);
        if (p.governor_consent_status === 'GOVERNOR_CONSENT_PENDING') {
          alerts.push({
            id: `gov-${p.id}`,
            category: 'GOVERNOR_CONSENT',
            title: `Governor Consent Pending: ${code}`,
            description: p.title || 'Awaiting executive consent approval',
            parcelId: p.id,
            createdAt: p.created_at,
          });
        } else if (p.status === 'disputed') {
          alerts.push({
            id: `disp-${p.id}`,
            category: 'DISPUTE',
            title: `Disputed Parcel Locked: ${code}`,
            description: p.title || 'Parcel frozen pending conflict resolution',
            parcelId: p.id,
            createdAt: p.created_at,
          });
        } else {
          alerts.push({
            id: `pend-${p.id}`,
            category: 'PENDING_AUDIT',
            title: `Pending Intake Audit: ${code}`,
            description: p.title || 'New cadastral application awaiting review',
            parcelId: p.id,
            createdAt: p.created_at,
          });
        }
      }

      for (const t of ticketsRes.data || []) {
        alerts.push({
          id: `tkt-${t.id}`,
          category: 'DISPUTE',
          title: t.subject,
          description: `Dispute ticket (${t.status})`,
          parcelId: t.parcel_id || undefined,
          createdAt: t.created_at,
        });
      }

      for (const d of pendingDocsRes.data || []) {
        alerts.push({
          id: `doc-${d.id}`,
          category: 'DOCUMENT_REVIEW',
          title: `Unreviewed ${d.document_type.replace(/_/g, ' ')}`,
          description: 'Document awaiting registrar statutory inspection',
          parcelId: d.parcel_id,
          createdAt: d.created_at,
        });
      }

      res.json({ notifications: alerts.slice(0, 15) });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: (err as Error).message });
    }
  });

  app.get('/api/registrar/parcels', requireRegistrar, async (req: Request, res: Response) => {
    try {
      const supabase = getSupabaseClient();
      const statusFilter = String(req.query.status || '').trim();
      const search = String(req.query.q || '').trim().toLowerCase();

      let query = supabase.from('parcels').select('*').order('created_at', { ascending: false });
      if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'governor_consent') {
          query = query.eq('governor_consent_status', 'GOVERNOR_CONSENT_PENDING');
        } else {
          query = query.eq('status', statusFilter);
        }
      }

      const { data: parcels, error } = await query.limit(200);
      if (error) {
        res.status(502).json({ error: `Failed to fetch parcels: ${error.message}` });
        return;
      }

      let filtered = parcels || [];
      if (search) {
        filtered = filtered.filter((p) => {
          const haystack = [
            p.id,
            p.parcel_id,
            p.parcel_code,
            p.title,
            p.owner_name,
            p.owner_email,
            p.owner_wallet,
            p.state_name,
            p.lga_name,
            p.district,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(search);
        });
      }

      const parcelIds = filtered.map((p) => p.id);
      const [assignmentsRes, verificationsRes, docsRes, txRes] = parcelIds.length
        ? await Promise.all([
            supabase.from('application_assignments').select('*').in('parcel_id', parcelIds),
            supabase.from('ownership_verifications').select('*').in('parcel_id', parcelIds),
            supabase.from('statutory_documents').select('id, parcel_id, document_type, review_status').in('parcel_id', parcelIds),
            supabase.from('wallet_transactions').select('*').in('parcel_id', parcelIds),
          ])
        : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

      res.json({
        parcels: filtered,
        assignments: assignmentsRes.data || [],
        verifications: verificationsRes.data || [],
        documentsSummary: docsRes.data || [],
        transactions: txRes.data || [],
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: (err as Error).message });
    }
  });

  app.get('/api/registrar/parcels/:id', requireRegistrar, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const supabase = getSupabaseClient();

      const { data: parcel, error } = await supabase
        .from('parcels')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        res.status(502).json({ error: `Failed to fetch parcel dossier: ${error.message}` });
        return;
      }
      if (!parcel) {
        res.status(404).json({ error: 'Parcel record not found.' });
        return;
      }

      const [
        assignmentsRes,
        documentsRes,
        reviewsRes,
        verificationRes,
        approvalsRes,
        transactionsRes,
        ticketsRes,
        titlesRes,
        settingsRes,
      ] = await Promise.all([
        supabase.from('application_assignments').select('*').eq('parcel_id', id).order('created_at', { ascending: false }),
        supabase.from('statutory_documents').select('*').eq('parcel_id', id).order('created_at', { ascending: false }),
        supabase.from('document_reviews').select('*').eq('parcel_id', id).order('created_at', { ascending: false }),
        supabase.from('ownership_verifications').select('*').eq('parcel_id', id).maybeSingle(),
        supabase.from('parcel_approvals').select('*').eq('parcel_id', id).order('created_at', { ascending: false }),
        supabase.from('wallet_transactions').select('*').eq('parcel_id', id).order('created_at', { ascending: false }),
        supabase.from('support_tickets').select('*').eq('parcel_id', id).order('created_at', { ascending: false }),
        supabase.from('land_titles').select('*').eq('parcel_id', id).order('created_at', { ascending: false }),
        supabase.from('system_settings').select('*'),
      ]);

      let governorConsentThresholdUsd = 100000;
      for (const s of settingsRes.data || []) {
        if (s.key === 'workflow_rules' && s.value?.governorConsentThresholdUsd != null) {
          governorConsentThresholdUsd = Number(s.value.governorConsentThresholdUsd);
        } else if (s.workflow_rules?.governorConsentThresholdUsd != null) {
          governorConsentThresholdUsd = Number(s.workflow_rules.governorConsentThresholdUsd);
        }
      }

      res.json({
        parcel,
        assignments: assignmentsRes.data || [],
        documents: documentsRes.data || [],
        documentReviews: reviewsRes.data || [],
        ownershipVerification: verificationRes.data || null,
        approvals: approvalsRes.data || [],
        transactions: transactionsRes.data || [],
        tickets: ticketsRes.data || [],
        titles: titlesRes.data || [],
        governorConsentThresholdUsd,
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: (err as Error).message });
    }
  });

  app.patch('/api/registrar/parcels/:id/status', requireRegistrar, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const { status, governor_consent_status, notes } = req.body || {};
      const supabase = getSupabaseClient();

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (status !== undefined) updates.status = status;
      if (governor_consent_status !== undefined) updates.governor_consent_status = governor_consent_status;
      if (notes !== undefined) updates.notes = notes;

      const { data: updated, error } = await supabase
        .from('parcels')
        .update(updates)
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (error) {
        res.status(502).json({ error: `Failed to update parcel status: ${error.message}` });
        return;
      }

      await writeAuditLog(supabase, {
        staff: req.registrar,
        action: 'PARCEL_STATUS_UPDATED',
        entityType: 'parcels',
        entityId: id,
        parcelId: id,
        details: updates,
      });

      res.json({ parcel: updated });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: (err as Error).message });
    }
  });

  app.post('/api/registrar/parcels/:id/assign', requireRegistrar, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const { assigned_staff_id, assigned_role, priority, notes } = req.body || {};
      const supabase = getSupabaseClient();

      const { data: assignment, error } = await supabase
        .from('application_assignments')
        .insert({
          parcel_id: id,
          assigned_staff_id: assigned_staff_id || req.registrar?.staff_id,
          assigned_role: assigned_role || 'registrar',
          priority: priority || 'normal',
          notes: notes || null,
          assigned_by: req.registrar?.staff_id || null,
        })
        .select('*')
        .single();

      if (error) {
        res.status(502).json({ error: `Failed to create assignment: ${error.message}` });
        return;
      }

      await writeAuditLog(supabase, {
        staff: req.registrar,
        action: 'APPLICATION_ASSIGNED',
        entityType: 'application_assignments',
        entityId: assignment.id,
        parcelId: id,
        details: { assigned_staff_id: assignment.assigned_staff_id, priority: assignment.priority },
      });

      res.json({ assignment });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: (err as Error).message });
    }
  });

  app.delete('/api/registrar/parcels/:id', requireRegistrar, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const reason = String(req.body?.reason || 'Invalid or duplicate cadastral submission');
      const supabase = getSupabaseClient();

      const { error: deleteErr } = await supabase.from('parcels').delete().eq('id', id);

      if (deleteErr) {
        // Fallback to marking as rejected if foreign-key constraints protect historical audit rows
        const { data: rejected, error: rejectErr } = await supabase
          .from('parcels')
          .update({ status: 'rejected', notes: reason, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select('*')
          .maybeSingle();

        if (rejectErr) {
          res.status(502).json({ error: `Failed to reject/delete parcel: ${rejectErr.message}` });
          return;
        }

        await writeAuditLog(supabase, {
          staff: req.registrar,
          action: 'PARCEL_REJECTED',
          entityType: 'parcels',
          entityId: id,
          parcelId: id,
          details: { reason },
        });

        res.json({ deleted: false, rejected: true, parcel: rejected });
        return;
      }

      await writeAuditLog(supabase, {
        staff: req.registrar,
        action: 'PARCEL_DELETED',
        entityType: 'parcels',
        entityId: id,
        details: { reason, parcelId: id },
      });

      res.json({ deleted: true, id });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: (err as Error).message });
    }
  });

  // =========================================================================
  // 4. GIS & POSTGIS BOUNDARY OVERLAP VERIFICATION
  // =========================================================================
  app.post('/api/registrar/gis/check-overlap', requireRegistrar, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parcelId = String(req.body?.parcelId || '').trim();
      const bufferMeters = Number(req.body?.bufferMeters ?? 0.5);
      const supabase = getSupabaseClient();

      const { data: parcel, error: parcelErr } = await supabase
        .from('parcels')
        .select('*')
        .eq('id', parcelId)
        .maybeSingle();

      if (parcelErr) {
        res.status(502).json({ error: `Failed to load parcel for GIS check: ${parcelErr.message}` });
        return;
      }
      if (!parcel) {
        res.status(404).json({ error: 'Parcel not found.' });
        return;
      }

      const geojson = (req.body?.geojson as Record<string, unknown>) || extractGeoJson(parcel);
      const metrics = computePolygonMetrics(geojson);

      if (!geojson) {
        res.status(400).json({ error: 'Parcel does not contain WGS84 polygon geometry (geojson/geom/boundary_coordinates).' });
        return;
      }

      const wkt = geoJsonToWkt(geojson);
      const inputGeom = wkt || JSON.stringify(geojson);

      let rpcMethodUsed = 'check_parcel_overlap(input_geom, buffer_meters)';
      let neighbors: Array<Record<string, unknown>> = [];

      const { data: rpcData, error: rpcErr } = await supabase.rpc('check_parcel_overlap', {
        input_geom: inputGeom,
        buffer_meters: bufferMeters,
      });

      if (rpcErr) {
        // Try GeoJSON parameter format if RPC expects GeoJSON directly
        const { data: rpcGeoData, error: rpcGeoErr } = await supabase.rpc('check_parcel_overlap', {
          input_geom: geojson,
          buffer_meters: bufferMeters,
        });

        if (rpcGeoErr) {
          res.status(502).json({
            error: `PostGIS RPC check_parcel_overlap failed: ${rpcGeoErr.message}`,
            rpcMethodUsed,
          });
          return;
        }
        neighbors = Array.isArray(rpcGeoData) ? rpcGeoData : [];
      } else {
        neighbors = Array.isArray(rpcData) ? rpcData : [];
      }

      // Exclude self from overlap conflicts
      const externalConflicts = neighbors.filter(
        (n) => String(n.parcel_id || n.id || '') !== parcel.id
      );

      // Persist spatial hash / centroid / area back onto parcel if missing
      const parcelPatch: Record<string, unknown> = {};
      if (!parcel.spatial_hash && metrics.spatialHash) parcelPatch.spatial_hash = metrics.spatialHash;
      if (!parcel.area_sqm && metrics.areaSqm) parcelPatch.area_sqm = metrics.areaSqm;
      if (!parcel.centroid_lat && metrics.centroid) {
        parcelPatch.centroid_lat = metrics.centroid.lat;
        parcelPatch.centroid_lng = metrics.centroid.lng;
      }
      if (Object.keys(parcelPatch).length > 0) {
        await supabase.from('parcels').update(parcelPatch).eq('id', parcel.id);
      }

      await writeAuditLog(supabase, {
        staff: req.registrar,
        action: 'GIS_OVERLAP_CHECK',
        entityType: 'parcels',
        entityId: parcel.id,
        parcelId: parcel.id,
        details: {
          bufferMeters,
          overlapCount: externalConflicts.length,
          spatialHash: parcel.spatial_hash || metrics.spatialHash,
        },
      });

      res.json({
        hasOverlap: externalConflicts.length > 0,
        bufferMeters,
        neighbors: externalConflicts,
        centroid: metrics.centroid,
        areaSqm: parcel.area_sqm || metrics.areaSqm,
        spatialHash: parcel.spatial_hash || metrics.spatialHash,
        rpcMethodUsed,
        checkedAt: new Date().toISOString(),
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: (err as Error).message });
    }
  });

  // =========================================================================
  // 5. STATUTORY & CUSTOMARY DOCUMENT REVIEW
  // =========================================================================
  app.post('/api/registrar/documents/:docId/review', requireRegistrar, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const docId = String(req.params.docId);
      const status = String(req.body?.status || '').toUpperCase();
      const reviewerNotes = String(req.body?.reviewerNotes || '').trim();
      const parcelId = String(req.body?.parcelId || '').trim();

      if (!['VERIFIED', 'NEEDS_CORRECTION', 'REJECTED'].includes(status)) {
        res.status(400).json({ error: 'Invalid review status. Must be VERIFIED, NEEDS_CORRECTION, or REJECTED.' });
        return;
      }

      const supabase = getSupabaseClient();
      const nowIso = new Date().toISOString();

      const { data: updatedDoc, error: docErr } = await supabase
        .from('statutory_documents')
        .update({
          review_status: status,
          reviewer_notes: reviewerNotes || null,
          updated_at: nowIso,
        })
        .eq('id', docId)
        .select('*')
        .maybeSingle();

      if (docErr) {
        res.status(502).json({ error: `Failed to update statutory document: ${docErr.message}` });
        return;
      }

      const resolvedParcelId = parcelId || updatedDoc?.parcel_id;

      const { data: reviewRow, error: revErr } = await supabase
        .from('document_reviews')
        .insert({
          document_id: docId,
          parcel_id: resolvedParcelId,
          status,
          reviewer_id: req.registrar?.id || null,
          reviewer_notes: reviewerNotes || null,
        })
        .select('*')
        .maybeSingle();

      if (revErr) {
        res.status(502).json({ error: `Failed to log document review: ${revErr.message}` });
        return;
      }

      await writeAuditLog(supabase, {
        staff: req.registrar,
        action: 'DOCUMENT_REVIEWED',
        entityType: 'statutory_documents',
        entityId: docId,
        parcelId: resolvedParcelId,
        details: { status, reviewerNotes },
      });

      res.json({ document: updatedDoc, review: reviewRow });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: (err as Error).message });
    }
  });

  // =========================================================================
  // 6. DUAL-TENURE OWNERSHIP VERIFICATION
  // =========================================================================
  app.post('/api/registrar/parcels/:id/ownership-verification', requireRegistrar, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parcelId = String(req.params.id);
      const statutoryScore = Math.max(0, Math.min(100, Number(req.body?.statutoryScore ?? 0)));
      const customaryScore = Math.max(0, Math.min(100, Number(req.body?.customaryScore ?? 0)));
      const communityAffidavit = String(req.body?.communityAffidavit || '').trim();
      const conflictNotes = String(req.body?.conflictNotes || '').trim();
      const status = String(req.body?.status || 'PENDING_AUDIT').toUpperCase();

      if (!['VERIFIED', 'CONFLICT_DETECTED', 'PENDING_AUDIT', 'REJECTED'].includes(status)) {
        res.status(400).json({ error: 'Invalid ownership verification status.' });
        return;
      }

      const supabase = getSupabaseClient();
      const nowIso = new Date().toISOString();

      const { data: existing } = await supabase
        .from('ownership_verifications')
        .select('id')
        .eq('parcel_id', parcelId)
        .maybeSingle();

      const payload = {
        parcel_id: parcelId,
        statutory_score: statutoryScore,
        customary_score: customaryScore,
        community_affidavit: communityAffidavit || null,
        conflict_notes: conflictNotes || null,
        status,
        verified_by: req.registrar?.staff_id || null,
        verified_at: status === 'VERIFIED' ? nowIso : null,
        updated_at: nowIso,
      };

      const query = existing
        ? supabase.from('ownership_verifications').update(payload).eq('id', existing.id).select('*').single()
        : supabase.from('ownership_verifications').insert(payload).select('*').single();

      const { data: verification, error } = await query;
      if (error) {
        res.status(502).json({ error: `Failed to save ownership verification: ${error.message}` });
        return;
      }

      await writeAuditLog(supabase, {
        staff: req.registrar,
        action: 'OWNERSHIP_VERIFICATION_SAVED',
        entityType: 'ownership_verifications',
        entityId: verification.id,
        parcelId,
        details: { statutoryScore, customaryScore, status },
      });

      res.json({ ownershipVerification: verification });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: (err as Error).message });
    }
  });

  // =========================================================================
  // 7. FEE RECONCILIATION (wallet_transactions + Polygon Amoy)
  // =========================================================================
  app.get('/api/registrar/transactions', requireRegistrar, async (_req: Request, res: Response) => {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(150);

      if (error) {
        res.status(502).json({ error: `Failed to fetch wallet_transactions: ${error.message}` });
        return;
      }
      res.json({ transactions: data || [] });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: (err as Error).message });
    }
  });

  app.post('/api/registrar/transactions/:txId/reconcile', requireRegistrar, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const txId = String(req.params.txId);
      const supabase = getSupabaseClient();

      const { data: txRow, error: fetchErr } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('id', txId)
        .maybeSingle();

      if (fetchErr || !txRow) {
        res.status(404).json({ error: fetchErr?.message || 'Transaction record not found.' });
        return;
      }

      if (!txRow.tx_hash || !/^0x[0-9a-fA-F]{64}$/.test(txRow.tx_hash)) {
        res.status(400).json({ error: 'Transaction row does not have a valid Polygon Amoy tx_hash.' });
        return;
      }

      const receiptCheck = await withAmoyProvider(async (provider) => {
        const receipt = await provider.getTransactionReceipt(txRow.tx_hash);
        if (!receipt) return { found: false, success: false };
        return {
          found: true,
          success: receipt.status === 1,
          blockNumber: receipt.blockNumber,
        };
      });

      if (!receiptCheck.found || !receiptCheck.success) {
        res.status(409).json({
          error: receiptCheck.found
            ? 'On-chain transaction reverted and cannot be reconciled as paid.'
            : 'Transaction not yet confirmed on Polygon Amoy.',
        });
        return;
      }

      const nowIso = new Date().toISOString();
      const { data: updated, error: updateErr } = await supabase
        .from('wallet_transactions')
        .update({
          status: 'confirmed',
          reconciled: true,
          reconciled_at: nowIso,
          reconciled_by: req.registrar?.staff_id || null,
        })
        .eq('id', txId)
        .select('*')
        .single();

      if (updateErr) {
        res.status(502).json({ error: `Failed to update reconciliation status: ${updateErr.message}` });
        return;
      }

      await writeAuditLog(supabase, {
        staff: req.registrar,
        action: 'FEE_TRANSACTION_RECONCILED',
        entityType: 'wallet_transactions',
        entityId: txId,
        parcelId: txRow.parcel_id,
        txHash: txRow.tx_hash,
        details: { blockNumber: receiptCheck.blockNumber, amount: txRow.amount, token: txRow.token_symbol },
      });

      res.json({ transaction: updated, blockNumber: receiptCheck.blockNumber });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: (err as Error).message });
    }
  });

  // =========================================================================
  // 8. GOVERNOR CONSENT FORWARDING & ON-CHAIN TITLE SYNC
  // =========================================================================
  app.post('/api/registrar/parcels/:id/forward-governor', requireRegistrar, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const notes = String(req.body?.notes || 'Forwarded for Executive Governor Consent review due to valuation threshold.');
      const supabase = getSupabaseClient();
      const nowIso = new Date().toISOString();

      const { data: updated, error } = await supabase
        .from('parcels')
        .update({
          governor_consent_status: 'GOVERNOR_CONSENT_PENDING',
          status: 'under_review',
          updated_at: nowIso,
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        res.status(502).json({ error: `Failed to forward parcel to Governor Consent: ${error.message}` });
        return;
      }

      await supabase.from('parcel_approvals').insert({
        parcel_id: id,
        approval_stage: 'REGISTRAR_TO_GOVERNOR',
        decision: 'FORWARDED',
        staff_id: req.registrar?.staff_id || null,
        notes,
      });

      await writeAuditLog(supabase, {
        staff: req.registrar,
        action: 'FORWARDED_TO_GOVERNOR_CONSENT',
        entityType: 'parcels',
        entityId: id,
        parcelId: id,
        details: { notes },
      });

      res.json({ parcel: updated });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: (err as Error).message });
    }
  });

  app.post('/api/registrar/titles/sync', requireRegistrar, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parcelId = String(req.body?.parcelId || '').trim();
      const txHash = String(req.body?.txHash || '').trim();
      const operation = String(req.body?.operation || 'register').toLowerCase(); // 'register' | 'transfer'
      const targetOwnerWallet = String(req.body?.ownerAddress || '').trim();
      const targetOwnerName = String(req.body?.ownerName || '').trim();
      const signerAddress = String(req.body?.signerAddress || '').trim();
      let tokenId = req.body?.tokenId != null ? String(req.body.tokenId) : '';

      if (!parcelId || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
        res.status(400).json({ error: 'parcelId and valid Polygon Amoy txHash are required.' });
        return;
      }

      const supabase = getSupabaseClient();
      const { data: parcel, error: parcelErr } = await supabase
        .from('parcels')
        .select('*')
        .eq('id', parcelId)
        .maybeSingle();

      if (parcelErr || !parcel) {
        res.status(404).json({ error: parcelErr?.message || 'Parcel not found.' });
        return;
      }

      // Inspect tx receipt on Polygon Amoy to confirm success and extract tokenId
      const onChain = await withAmoyProvider(async (provider) => {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt || receipt.status !== 1) {
          throw new Error('Transaction is not confirmed or reverted on Polygon Amoy.');
        }

        const registryIface = new ethers.Interface(LAND_REGISTRY_ABI);
        const nftIface = new ethers.Interface(LAND_TITLE_NFT_ABI);
        let parsedTokenId = tokenId;

        for (const log of receipt.logs) {
          const addr = log.address.toLowerCase();
          try {
            if (addr === CONTRACT_ADDRESSES.LandRegistry.toLowerCase()) {
              const ev = registryIface.parseLog(log);
              if (ev && (ev.name === 'RegistrationExecuted' || ev.name === 'TransferExecuted')) {
                parsedTokenId = ev.args.tokenId.toString();
              }
            } else if (addr === CONTRACT_ADDRESSES.LandTitleNFT.toLowerCase()) {
              const ev = nftIface.parseLog(log);
              if (ev && ev.name === 'TitleIssued') {
                parsedTokenId = ev.args.tokenId.toString();
              }
            }
          } catch {
            // ignore non-matching logs
          }
        }

        return {
          blockNumber: receipt.blockNumber,
          tokenId: parsedTokenId,
        };
      });

      tokenId = onChain.tokenId || String(parcel.nft_token_id || '');
      const nowIso = new Date().toISOString();
      const parcelCode = parcel.parcel_code || parcel.parcel_id || parcel.id;
      const metadataUri = buildParcelMetadataUri(parcelCode);
      const spatialHash = parcel.spatial_hash || keccakId(parcel.id);
      const ownerWallet = targetOwnerWallet || parcel.owner_wallet || '';

      const parcelUpdate: Record<string, unknown> = {
        status: 'verified',
        nft_token_id: tokenId ? Number(tokenId) : parcel.nft_token_id,
        nft_contract_address: CONTRACT_ADDRESSES.LandTitleNFT,
        chain_id: POLYGON_AMOY_CHAIN_ID,
        last_tx_hash: txHash,
        updated_at: nowIso,
      };
      if (operation === 'transfer' && ownerWallet) {
        parcelUpdate.owner_wallet = ownerWallet;
        if (targetOwnerName) parcelUpdate.owner_name = targetOwnerName;
        parcelUpdate.is_for_sale = false;
      }

      const { data: updatedParcel, error: updErr } = await supabase
        .from('parcels')
        .update(parcelUpdate)
        .eq('id', parcel.id)
        .select('*')
        .single();

      if (updErr) {
        res.status(502).json({ error: `On-chain tx confirmed, but failed to update parcels table: ${updErr.message}` });
        return;
      }

      // Sync land_titles
      const { data: existingTitle } = await supabase
        .from('land_titles')
        .select('id')
        .eq('parcel_id', parcel.id)
        .maybeSingle();

      const titlePayload = {
        parcel_id: parcel.id,
        token_id: tokenId || '0',
        contract_address: CONTRACT_ADDRESSES.LandTitleNFT,
        chain_id: POLYGON_AMOY_CHAIN_ID,
        owner_wallet: ownerWallet,
        owner_name: targetOwnerName || parcel.owner_name || null,
        spatial_hash: spatialHash,
        metadata_uri: metadataUri,
        mint_tx_hash: operation === 'register' ? txHash : undefined,
        last_tx_hash: txHash,
        status: 'ACTIVE',
        issued_at: nowIso,
      };

      const { data: syncedTitle } = existingTitle
        ? await supabase.from('land_titles').update(titlePayload).eq('id', existingTitle.id).select('*').maybeSingle()
        : await supabase.from('land_titles').insert(titlePayload).select('*').maybeSingle();

      await supabase.from('parcel_approvals').insert({
        parcel_id: parcel.id,
        approval_stage: operation === 'transfer' ? 'ONCHAIN_TITLE_TRANSFER' : 'ONCHAIN_TITLE_MINT',
        decision: 'APPROVED',
        staff_id: req.registrar?.staff_id || null,
        signer_wallet: signerAddress || null,
        tx_hash: txHash,
        notes: `Token #${tokenId} confirmed in block ${onChain.blockNumber} on Polygon Amoy (80002).`,
      });

      await writeAuditLog(supabase, {
        staff: req.registrar,
        action: operation === 'transfer' ? 'TITLE_TRANSFERRED_ONCHAIN' : 'TITLE_MINTED_ONCHAIN',
        entityType: 'land_titles',
        entityId: syncedTitle?.id || parcel.id,
        parcelId: parcel.id,
        txHash,
        details: {
          tokenId,
          blockNumber: onChain.blockNumber,
          ownerWallet,
          metadataUri,
        },
      });

      res.json({
        parcel: updatedParcel,
        landTitle: syncedTitle,
        tokenId,
        blockNumber: onChain.blockNumber,
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: (err as Error).message });
    }
  });

  // =========================================================================
  // 9. DISPUTE FLAGGING & REGISTRY LEDGER
  // =========================================================================
  app.post('/api/registrar/parcels/:id/dispute', requireRegistrar, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parcelId = String(req.params.id);
      const action = String(req.body?.action || 'lock'); // 'lock' | 'unlock'
      const subject = String(req.body?.subject || 'Cadastral Boundary / Ownership Conflict').trim();
      const description = String(req.body?.description || '').trim();
      const priority = String(req.body?.priority || 'high').toLowerCase();

      const supabase = getSupabaseClient();
      const nowIso = new Date().toISOString();

      if (action === 'unlock') {
        const { data: updatedParcel, error: pErr } = await supabase
          .from('parcels')
          .update({ status: 'verified', updated_at: nowIso })
          .eq('id', parcelId)
          .select('*')
          .single();

        if (pErr) {
          res.status(502).json({ error: `Failed to unlock parcel: ${pErr.message}` });
          return;
        }

        await supabase
          .from('land_titles')
          .update({ status: 'ACTIVE' })
          .eq('parcel_id', parcelId);

        await supabase
          .from('support_tickets')
          .update({
            status: 'resolved',
            resolution_notes: description || 'Dispute cleared by Registrar.',
            updated_at: nowIso,
          })
          .eq('parcel_id', parcelId)
          .eq('status', 'open');

        await writeAuditLog(supabase, {
          staff: req.registrar,
          action: 'DISPUTE_UNLOCKED',
          entityType: 'parcels',
          entityId: parcelId,
          parcelId,
          details: { notes: description },
        });

        res.json({ parcel: updatedParcel, locked: false });
        return;
      }

      const { data: ticket, error: tErr } = await supabase
        .from('support_tickets')
        .insert({
          parcel_id: parcelId,
          ticket_type: 'dispute',
          subject,
          description: description || null,
          priority,
          status: 'open',
          created_by: req.registrar?.staff_id || null,
          assigned_to: req.registrar?.staff_id || null,
        })
        .select('*')
        .single();

      if (tErr) {
        res.status(502).json({ error: `Failed to open dispute ticket: ${tErr.message}` });
        return;
      }

      const { data: updatedParcel } = await supabase
        .from('parcels')
        .update({ status: 'disputed', updated_at: nowIso })
        .eq('id', parcelId)
        .select('*')
        .single();

      await supabase
        .from('land_titles')
        .update({ status: 'ESCROW_LOCKED' })
        .eq('parcel_id', parcelId);

      await writeAuditLog(supabase, {
        staff: req.registrar,
        action: 'DISPUTE_FLAGGED_AND_LOCKED',
        entityType: 'support_tickets',
        entityId: ticket.id,
        parcelId,
        details: { subject, priority },
      });

      res.json({ parcel: updatedParcel, ticket, locked: true });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: (err as Error).message });
    }
  });

  app.get('/api/registrar/ledger', requireRegistrar, async (_req: Request, res: Response) => {
    try {
      const supabase = getSupabaseClient();
      const [titlesRes, parcelsRes, ticketsRes, auditsRes] = await Promise.all([
        supabase.from('land_titles').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('parcels').select('id, parcel_id, parcel_code, title, status, state_name, lga_name, area_sqm, owner_name, owner_wallet, nft_token_id, last_tx_hash').limit(200),
        supabase.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(40),
      ]);

      if (titlesRes.error) {
        res.status(502).json({ error: `Failed to fetch registry ledger: ${titlesRes.error.message}` });
        return;
      }

      res.json({
        titles: titlesRes.data || [],
        parcels: parcelsRes.data || [],
        tickets: ticketsRes.data || [],
        auditLogs: auditsRes.data || [],
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({ error: (err as Error).message });
    }
  });

  // =========================================================================
  // VITE / STATIC SERVING
  // =========================================================================
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ANAGU Registrar Portal listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
