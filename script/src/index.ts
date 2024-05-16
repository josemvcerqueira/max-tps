import {
  getFullnodeUrl,
  OwnedObjectRef,
  SuiClient,
} from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { SuiObjectRef } from '@mysten/sui.js/dist/cjs/transactions';
import util from 'util';

export const log = (x: unknown) =>
  console.log(util.inspect(x, false, null, true));

// TODO SET THESE. Increase the budget and price if needed.
const PRIVATE_KEY = '';
const SEND_TRANSACTION_GAS_BUDGET = 30_000_000n;
const GET_GAS_COINS_GAS_BUDGET = 20_000_000n;
const GAS_PRICE = 1100n;
const TPS = 10;
const SEQUENT_TXS = 10n;
const USELESS_PKG = '';

const AMOUNTS = Array(TPS).fill(SEND_TRANSACTION_GAS_BUDGET * SEQUENT_TXS);

const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });

const keyPair = Ed25519Keypair.fromSecretKey(
  Uint8Array.from(Buffer.from(PRIVATE_KEY, 'base64')).slice(1)
);

interface SendTransactionArgs {
  suiClient: SuiClient;
  keyPair: Ed25519Keypair;
  gasCoin: SuiObjectRef;
}

interface GetGasCoinsArgs {
  suiClient: SuiClient;
  keyPair: Ed25519Keypair;
}

const getGasCoins = async ({ suiClient, keyPair }: GetGasCoinsArgs) => {
  const txb = new TransactionBlock();

  txb.setSender(keyPair.toSuiAddress());
  txb.setGasBudget(GET_GAS_COINS_GAS_BUDGET); // Adjust gas budget as necessary
  txb.setGasPrice(GAS_PRICE);

  const results = txb.splitCoins(
    txb.gas,
    AMOUNTS.map((x) => txb.pure.u64(x))
  );

  AMOUNTS.forEach((_, index) => {
    txb.transferObjects([results[index]], keyPair.toSuiAddress());
  });

  const bytes = await txb.build({ client: suiClient, limits: {} });

  const result = await suiClient.signAndExecuteTransactionBlock({
    signer: keyPair,
    transactionBlock: bytes,
    options: { showEffects: true },
  });

  return result.effects?.created || [];
};

const sendTransaction = async ({
  suiClient,
  keyPair,
  gasCoin,
}: SendTransactionArgs) => {
  const txb = new TransactionBlock();

  txb.setSender(keyPair.toSuiAddress());
  txb.setGasBudget(SEND_TRANSACTION_GAS_BUDGET); // Adjust gas budget as necessary
  txb.setGasPrice(GAS_PRICE);
  txb.setGasPayment([gasCoin]);

  const object = txb.moveCall({
    target: `${USELESS_PKG}::useless::new`,
  });

  txb.moveCall({
    target: `${USELESS_PKG}::useless::destroy`,
    arguments: [object],
  });

  const bytes = await txb.build({ client: suiClient, limits: {} });

  const result = await suiClient.signAndExecuteTransactionBlock({
    signer: keyPair,
    transactionBlock: bytes,
    options: { showEffects: true },
  });

  return result.effects?.mutated!;
};

const loop = async (data: OwnedObjectRef[][]) => {
  const promises = [];
  for (const result of data) {
    promises.push(
      sendTransaction({
        suiClient,
        keyPair,
        gasCoin: result[0].reference,
      })
    );
  }

  const remainingGasCoin = await Promise.all(promises);

  log('Batch sent');

  if (remainingGasCoin.length) await loop(remainingGasCoin);
};

const main = async () => {
  try {
    const gasCoins = await getGasCoins({ suiClient, keyPair });

    log('Gas Coins Created');

    const promises = [];

    for (const gas of gasCoins) {
      promises.push(
        sendTransaction({ suiClient, keyPair, gasCoin: gas.reference })
      );
    }

    const remainingGasCoin = await Promise.all(promises);
    log('Batch sent');

    if (remainingGasCoin?.length) await loop(remainingGasCoin);

    log('Script ran!');
  } catch (e) {
    log(e);
  }
};

main();
