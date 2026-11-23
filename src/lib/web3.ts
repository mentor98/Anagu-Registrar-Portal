import { ethers } from 'ethers';
import {
  ANAGU_TOKEN_ABI,
  CONTRACT_ADDRESSES,
  LAND_REGISTRY_ABI,
  POLYGON_AMOY_CHAIN_HEX,
  POLYGON_AMOY_CHAIN_ID,
  POLYGON_AMOY_NETWORK_CONFIG,
  REGISTRAR_ROLE_HASH,
  buildParcelMetadataUri,
  keccakId,
} from './contracts';

export interface EthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}

export function getEthereumProvider(): EthereumProvider | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as { ethereum?: EthereumProvider };
  return win.ethereum || null;
}

export async function switchToPolygonAmoy(): Promise<void> {
  const eth = getEthereumProvider();
  if (!eth) {
    throw new Error('MetaMask or a compatible EVM wallet extension is required.');
  }

  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: POLYGON_AMOY_CHAIN_HEX }],
    });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [POLYGON_AMOY_NETWORK_CONFIG],
      });
    } else {
      throw err;
    }
  }
}

export async function connectMetaMaskWallet(promptAccountSelect = false): Promise<{
  address: string;
  chainId: number;
}> {
  const eth = getEthereumProvider();
  if (!eth) {
    throw new Error('No EVM wallet detected. Install MetaMask to connect a Registrar wallet.');
  }

  if (promptAccountSelect) {
    await eth.request({
      method: 'wallet_requestPermissions',
      params: [{ eth_accounts: {} }],
    });
  }

  const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
  if (!accounts || accounts.length === 0) {
    throw new Error('No wallet account selected.');
  }

  const chainHex = (await eth.request({ method: 'eth_chainId' })) as string;
  const currentChainId = parseInt(chainHex, 16);

  if (currentChainId !== POLYGON_AMOY_CHAIN_ID) {
    await switchToPolygonAmoy();
  }

  const finalChainHex = (await eth.request({ method: 'eth_chainId' })) as string;
  return {
    address: ethers.getAddress(accounts[0]),
    chainId: parseInt(finalChainHex, 16),
  };
}

export interface MintOrTransferParams {
  operation: 'register' | 'transfer';
  applicationId: string;
  parcelId: string;
  spatialHash: string;
  ownerAddress: string;
  tokenId?: string | number | null;
  onProgress?: (step: string) => void;
}

export interface MintOrTransferResult {
  txHash: string;
  tokenId: string;
  blockNumber: number;
  signerAddress: string;
  metadataUri: string;
}

export async function executeOnChainTitleAction(
  params: MintOrTransferParams
): Promise<MintOrTransferResult> {
  const eth = getEthereumProvider();
  if (!eth) {
    throw new Error('MetaMask is not installed.');
  }

  if (!ethers.isAddress(params.ownerAddress)) {
    throw new Error('Valid recipient wallet address is required.');
  }

  await switchToPolygonAmoy();

  const browserProvider = new ethers.BrowserProvider(eth as ethers.Eip1193Provider);
  const signer = await browserProvider.getSigner();
  const signerAddress = await signer.getAddress();

  const registry = new ethers.Contract(CONTRACT_ADDRESSES.LandRegistry, LAND_REGISTRY_ABI, signer);
  const token = new ethers.Contract(CONTRACT_ADDRESSES.ANAGUToken, ANAGU_TOKEN_ABI, signer);

  params.onProgress?.('Verifying REGISTRAR_ROLE on LandRegistry...');
  const hasRole: boolean = await registry.hasRole(REGISTRAR_ROLE_HASH, signerAddress);
  if (!hasRole) {
    throw new Error(
      `Connected wallet ${signerAddress} does not hold REGISTRAR_ROLE on LandRegistry (${CONTRACT_ADDRESSES.LandRegistry}).`
    );
  }

  const appBytes = keccakId(params.applicationId);
  params.onProgress?.('Checking applicationProcessed state...');
  const alreadyProcessed: boolean = await registry.applicationProcessed(appBytes);
  if (alreadyProcessed) {
    throw new Error(`Application ID ${params.applicationId} has already been executed on-chain.`);
  }

  const feeType = params.operation === 'transfer' ? 1 : 0;
  const requiredFee: bigint = await registry.fees(feeType);

  if (requiredFee > 0n) {
    params.onProgress?.('Checking ANAGU token balance and allowance...');
    const [balance, allowance] = await Promise.all([
      token.balanceOf(signerAddress) as Promise<bigint>,
      token.allowance(signerAddress, CONTRACT_ADDRESSES.LandRegistry) as Promise<bigint>,
    ]);

    if (balance < requiredFee) {
      const decimals = Number(await token.decimals());
      throw new Error(
        `Insufficient ANAGU balance for protocol fee. Required: ${ethers.formatUnits(requiredFee, decimals)} ANAGU, Available: ${ethers.formatUnits(balance, decimals)} ANAGU.`
      );
    }

    if (allowance < requiredFee) {
      params.onProgress?.('Requesting ANAGUToken approval for LandRegistry...');
      const approveTx = await token.approve(CONTRACT_ADDRESSES.LandRegistry, requiredFee);
      params.onProgress?.(`Waiting for ANAGU approval tx ${approveTx.hash.slice(0, 10)}…`);
      await approveTx.wait();
    }
  }

  const metadataUri = buildParcelMetadataUri(params.parcelId);
  let tx: ethers.ContractTransactionResponse;

  if (params.operation === 'transfer') {
    if (params.tokenId === undefined || params.tokenId === null || params.tokenId === '') {
      throw new Error('Existing NFT Token ID is required for title conveyance transfer.');
    }
    params.onProgress?.('Submitting LandRegistry.transferTitle transaction...');
    tx = await registry.transferTitle(appBytes, BigInt(params.tokenId), ethers.getAddress(params.ownerAddress));
  } else {
    const parcelBytes = keccakId(params.parcelId);
    const spatialBytes = keccakId(params.spatialHash);
    params.onProgress?.('Submitting LandRegistry.registerTitle transaction...');
    tx = await registry.registerTitle(
      appBytes,
      ethers.getAddress(params.ownerAddress),
      parcelBytes,
      spatialBytes,
      metadataUri
    );
  }

  params.onProgress?.(`Waiting for Polygon Amoy confirmation (${tx.hash.slice(0, 10)}…)`);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error('On-chain transaction reverted during execution.');
  }

  let resolvedTokenId = params.tokenId ? String(params.tokenId) : '';
  const registryIface = new ethers.Interface(LAND_REGISTRY_ABI);
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === CONTRACT_ADDRESSES.LandRegistry.toLowerCase()) {
      try {
        const parsed = registryIface.parseLog(log);
        if (parsed && (parsed.name === 'RegistrationExecuted' || parsed.name === 'TransferExecuted')) {
          resolvedTokenId = parsed.args.tokenId.toString();
        }
      } catch {
        // ignore
      }
    }
  }

  return {
    txHash: receipt.hash,
    tokenId: resolvedTokenId,
    blockNumber: receipt.blockNumber,
    signerAddress,
    metadataUri,
  };
}
