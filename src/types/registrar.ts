export type RegistrarTab =
  | 'overview'
  | 'intake'
  | 'gis'
  | 'documents'
  | 'ownership'
  | 'fees'
  | 'minting'
  | 'ledger';

export interface StaffProfile {
  id: string;
  staff_id: string;
  role: string;
  full_name: string;
  email?: string | null;
  jurisdiction?: string | null;
  state_name?: string | null;
  lga_name?: string | null;
  wallet_address?: string | null;
  is_active: boolean;
  last_login_at?: string | null;
}

export interface ParcelRecord {
  id: string;
  parcel_id?: string | null;
  parcel_code?: string | null;
  title?: string | null;
  owner_id?: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  owner_phone?: string | null;
  owner_wallet?: string | null;
  new_owner_wallet?: string | null;
  new_owner_name?: string | null;
  application_type?: 'registration' | 'transfer' | string | null;
  application_id?: string | null;
  state_name?: string | null;
  lga_name?: string | null;
  district?: string | null;
  address?: string | null;
  land_use?: string | null;
  tenure_type?: string | null;
  area_sqm?: number | null;
  estimated_value_usd?: number | null;
  status: string;
  governor_consent_status?: string | null;
  is_for_sale?: boolean;
  nft_token_id?: string | number | null;
  nft_contract_address?: string | null;
  chain_id?: number | null;
  last_tx_hash?: string | null;
  spatial_hash?: string | null;
  centroid_lat?: number | null;
  centroid_lng?: number | null;
  geom?: unknown;
  geojson?: GeoJSONGeometry | null;
  boundary_coordinates?: Array<[number, number]> | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface GeoJSONGeometry {
  type: 'Polygon' | 'MultiPolygon' | 'Point';
  coordinates: unknown;
}

export interface ApplicationAssignment {
  id: string;
  parcel_id: string;
  assigned_staff_id: string;
  assigned_role?: string | null;
  priority?: string | null;
  notes?: string | null;
  assigned_by?: string | null;
  created_at?: string | null;
}

export interface StatutoryDocument {
  id: string;
  parcel_id: string;
  document_type: string;
  file_name?: string | null;
  storage_path?: string | null;
  file_url?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  review_status?: string | null;
  reviewer_notes?: string | null;
  uploaded_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DocumentReview {
  id: string;
  document_id: string;
  parcel_id: string;
  status: 'VERIFIED' | 'NEEDS_CORRECTION' | 'REJECTED' | 'PENDING' | string;
  reviewer_id?: string | null;
  reviewer_notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface OwnershipVerification {
  id: string;
  parcel_id: string;
  statutory_score: number;
  customary_score: number;
  community_affidavit?: string | null;
  conflict_notes?: string | null;
  status: 'VERIFIED' | 'CONFLICT_DETECTED' | 'PENDING_AUDIT' | 'REJECTED' | string;
  verified_by?: string | null;
  verified_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface LandTitleRecord {
  id: string;
  parcel_id: string;
  token_id: string | number;
  contract_address?: string | null;
  chain_id?: number | null;
  owner_wallet?: string | null;
  owner_name?: string | null;
  spatial_hash?: string | null;
  metadata_uri?: string | null;
  mint_tx_hash?: string | null;
  last_tx_hash?: string | null;
  status: string;
  issued_at?: string | null;
  created_at?: string | null;
}

export interface ParcelApproval {
  id: string;
  parcel_id: string;
  approval_stage: string;
  decision: string;
  staff_id?: string | null;
  signer_wallet?: string | null;
  tx_hash?: string | null;
  notes?: string | null;
  created_at?: string | null;
}

export interface WalletTransaction {
  id: string;
  parcel_id?: string | null;
  user_id?: string | null;
  wallet_address?: string | null;
  tx_hash: string;
  tx_type?: string | null;
  token_symbol?: string | null;
  amount?: string | number | null;
  chain_id?: number | null;
  status: string;
  reconciled?: boolean;
  reconciled_at?: string | null;
  reconciled_by?: string | null;
  created_at?: string | null;
}

export interface SupportTicket {
  id: string;
  parcel_id?: string | null;
  ticket_type?: string | null;
  subject: string;
  description?: string | null;
  priority?: string | null;
  status: string;
  created_by?: string | null;
  assigned_to?: string | null;
  resolution_notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AuditLog {
  id: string;
  actor_id?: string | null;
  actor_staff_id?: string | null;
  actor_role?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  parcel_id?: string | null;
  tx_hash?: string | null;
  details?: Record<string, unknown> | null;
  created_at?: string | null;
}

export interface OverlapNeighbor {
  parcel_id: string;
  parcel_code?: string | null;
  title?: string | null;
  status?: string | null;
  overlap_area_sqm?: number | null;
  distance_meters?: number | null;
  geojson?: GeoJSONGeometry | null;
}

export interface OverlapCheckResponse {
  hasOverlap: boolean;
  bufferMeters: number;
  neighbors: OverlapNeighbor[];
  centroid?: { lat: number; lng: number } | null;
  areaSqm?: number | null;
  spatialHash?: string | null;
  rpcMethodUsed: string;
  checkedAt: string;
}

export interface BlockchainStatus {
  chainId: number;
  blockNumber: number;
  rpcUrl: string;
  registrationFeeWei: string;
  registrationFeeFormatted: string;
  transferFeeWei: string;
  transferFeeFormatted: string;
  titlesIssued: string;
  transfersCompleted: string;
  totalFeesCollectedWei: string;
  totalFeesCollectedFormatted: string;
  treasury: string;
}

export interface WalletOnChainInfo {
  address: string;
  polBalanceWei: string;
  polBalanceFormatted: string;
  anaguBalanceWei: string;
  anaguBalanceFormatted: string;
  anaguAllowanceWei: string;
  anaguAllowanceFormatted: string;
  hasRegistrarRole: boolean;
  decimals: number;
}

export interface TxInspectionResult {
  txHash: string;
  found: boolean;
  confirmed: boolean;
  status: 'SUCCESS' | 'REVERTED' | 'PENDING' | 'NOT_FOUND';
  blockNumber?: number;
  confirmations?: number;
  from?: string;
  to?: string;
  valuePol?: string;
  gasUsed?: string;
  timestamp?: number;
  decodedEvents: Array<{
    contract: string;
    eventName: string;
    args: Record<string, string>;
  }>;
}

export interface RegistrarNotification {
  id: string;
  category: 'PENDING_AUDIT' | 'GOVERNOR_CONSENT' | 'DISPUTE' | 'DOCUMENT_REVIEW';
  title: string;
  description: string;
  parcelId?: string;
  createdAt?: string | null;
}
