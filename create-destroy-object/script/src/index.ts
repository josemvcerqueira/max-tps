import {
  getFullnodeUrl,
  OwnedObjectRef,
  SuiClient,
} from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { SuiObjectRef } from '@mysten/sui.js/client';
import util from 'util';
import invariant from 'tiny-invariant';

export const log = (x: unknown) =>
  console.log(util.inspect(x, false, null, true));

// TODO SET THESE. Increase the budget and price if needed.
// TODO ADD same number of keys and RPCs, we might need diff URLs. Try with the same one first
const PRIVATE_KEYS = [''];
const RPC_URLS = [getFullnodeUrl('testnet')];
const SEND_TRANSACTION_GAS_BUDGET = 30_000_000n;
const GET_GAS_COINS_GAS_BUDGET = 20_000_000n;
const GAS_PRICE = 1100n;
const TPS = 10;
const SEQUENT_TXS = 10n;
const USELESS_PKG =
  '0xcd7af24572133a6772fae2867d37dd65f817da917cb44a056ec38743211f66cc';

const AMOUNTS = Array(TPS).fill(SEND_TRANSACTION_GAS_BUDGET * SEQUENT_TXS);

const makeKeyPair = (key: string) =>
  Ed25519Keypair.fromSecretKey(
    Uint8Array.from(Buffer.from(key, 'base64')).slice(1)
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

interface LoopArgs {
  data: OwnedObjectRef[][];
  suiClient: SuiClient;
  keyPair: Ed25519Keypair;
}

const loop = async ({ data, suiClient, keyPair }: LoopArgs) => {
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

  if (remainingGasCoin.length)
    await loop({ data: remainingGasCoin, suiClient, keyPair });
};

interface RunArgs {
  suiClient: SuiClient;
  keyPair: Ed25519Keypair;
}

const run = async ({ suiClient, keyPair }: RunArgs) => {
  try {
    const gasCoins = await getGasCoins({ suiClient, keyPair });
    invariant(gasCoins.length, 'Failed to create gas coins');

    log('Gas Coins Created');

    const promises = [];

    for (const gas of gasCoins) {
      promises.push(
        sendTransaction({ suiClient, keyPair, gasCoin: gas.reference })
      );
    }

    const remainingGasCoin = await Promise.all(promises);
    log('Batch sent');

    if (remainingGasCoin?.length)
      await loop({ data: remainingGasCoin, suiClient, keyPair });

    log('Script ran!');
  } catch (e) {
    log(e);
  }
};

const main = () => {
  invariant(PRIVATE_KEYS.length, 'Missing private keys');
  invariant(RPC_URLS.length, 'Missing RPCs');
  invariant(PRIVATE_KEYS.length === RPC_URLS.length, 'Wrong set up');

  PRIVATE_KEYS.forEach((key, index) => {
    run({
      suiClient: new SuiClient({ url: RPC_URLS[index] }),
      keyPair: makeKeyPair(key),
    });
  });
};

main();
