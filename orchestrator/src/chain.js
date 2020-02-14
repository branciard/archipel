const { ApiPromise, WsProvider } = require('@polkadot/api');
const { getKeysFromSeed } = require('./utils');
const debug = require('debug')('chain');

// Show transaction status in debug
const transactionShowStatus = (status, where) => {
  if (status.isInvalid) debug(where, 'Transaction is invalid.');
  if (status.isDropped) debug(where, 'Transaction is dropped.');
  if (status.isUsurped) debug(where, 'Transaction is usurped.');
  if (status.isReady) debug(where, 'Transaction is ready.');
  if (status.isFuture) debug(where, 'Transaction is future.');
  if (status.isFinalized) debug(where, 'Transaction is finalized.');
  if (status.isBroadcast) debug(where, 'Transaction is broadcast.');
};

// Connecting to provider
const connect = async (wsProvider) => {
  try {
    // Creating Websocket Provider
    const provider = new WsProvider(wsProvider);
    // Creating API
    const api = await ApiPromise.create({ provider });
    return api;
  } catch (error) {
    debug('connect', error);
    throw error;
  }
};

// Listen events
const listenEvents = async (api, metrics, mnemonic) => {
  try {
    const keys = await getKeysFromSeed(mnemonic);
    // Subscribe to events
    await api.query.system.events((events) => {
      // Loop through events
      events.forEach(({ event = [] }) => {
        // If change leader event received
        if (event.section.toString() === 'archipelModule' && event.method.toString() === 'NewLeader') {
          debug('listenEvents', `Received new leader event from ${event.data[0].toString()}`);
          if (event.data[0].toString() !== keys.address.toString()) {
            console.log('Checking if service is in passive state...');
          }
        }
        
        // Add metrics if Metrics updated event was received
        if (event.section.toString() === 'archipelModule' && event.method.toString() === 'MetricsUpdated') {
          debug('listenEvents', `Received metrics updated event from ${event.data[0].toString()}`);
          metrics.addMetrics(event.data[0].toString(), event.data[1].toString(), event.data[2].toString());
        }
      });
    });
  } catch (error) {
    debug('listenEvents', error);
    throw error;
  }
};

// If node state permits to send transactions
const canSendTransactions = async api => {
  try {
    // Get peers number
    const peersNumber = await getPeerNumber(api);
    debug('addMetrics', `Node has ${peersNumber} peers.`);

    // Get sync state
    const syncState = await getSyncState(api);
    debug('addMetrics', `Node is sync: ${syncState}`);

    // If node has any peers and is not in synchronizing chain
    return peersNumber !== 0 && syncState !== true;
  } catch (error) {
    debug('canSendTransactions', error);
    throw error;
  }
};

// Send metrics
const addMetrics = async (api, metrics, mnemonic) => {
  try {
    // If node state permits to send transactions
    const sendTransaction = await canSendTransactions(api);

    // If node has any peers and is not in synchronizing chain
    if (sendTransaction) {
      console.log('Archipel node has some peers and is synchronized so adding metrics...');

      // Get keys from mnemonic
      const keys = await getKeysFromSeed(mnemonic);

      // Get account nonce
      const nonce = await api.query.system.accountNonce(keys.address);

      // Nonce show
      debug('addMetrics', `Nonce: ${nonce}`);

      // create, sign and send transaction
      return new Promise((resolve, reject) => {
        api.tx.archipelModule
        // Create transaction
          .addMetrics(metrics)
        // Sign transaction
          .sign(keys, { nonce })
        // Send transaction
          .send(({ events = [], status }) => {
          // Debug show transaction status
            transactionShowStatus(status, 'addMetrics');
            if (status.isFinalized) {
              events.forEach(async ({ event: { data, method, section } }) => {
                if (section.toString() === 'archipelModule' && method.toString() === 'MetricsUpdated') {
                // Show transaction data for Debug
                  debug('addMetrics', 'Transaction was successfully sent and generated an event.');
                  debug('addMetrics', `JSON Data: [${JSON.parse(data.toString())}]`);
                  resolve(true);
                }
              });
              resolve(false);
            }
          }).catch(err => reject(err));
      });
    } else {
      console.log('Archipel node can\'t receive transactions...');
      return false;
    }
  } catch (error) {
    debug('addMetrics', error);
    throw error;
  }
};

// Get current leader from Runtime
const getLeader = async api => {
  try {
    return await api.query.archipelModule.leader();
  } catch (error) {
    debug('getLeader', error);
    return false;
  }
};

// Get metrics from Runtime
const getMetrics = async (api, key) => {
  try {
    return await api.query.archipelModule.metrics(key);
  } catch (error) {
    debug('getMetrics', error);
    console.log(error);
    return false;
  }
};

// Get peer number connected to Archipel node
const getPeerNumber = async api => {
  try {
    const peers = await api.rpc.system.peers();
    return peers.length;
  } catch (error) {
    debug('getPeerNumber', error);
    return 0;
  }
};

// Get node sync state. Gives true if node is synching
const getSyncState = async api => {
  try {
    const health = await api.rpc.system.health();
    return health.isSyncing.toString() === 'true';
  } catch (error) {
    debug('getSyncState', error);
    return 0;
  }
};

// Set leader
const setLeader = async (api, oldLeader, mnemonic) => {
  try {
    // Get keys from mnemonic
    const keys = await getKeysFromSeed(mnemonic);

    // Get account nonce
    const nonce = await api.query.system.accountNonce(keys.address);

    // Nonce show
    debug('setLeader', `Nonce: ${nonce}`);

    return new Promise((resolve, reject) => {
      // create, sign and send transaction
      api.tx.archipelModule
        // create transaction
        .setLeader(oldLeader)
        // Sign and transaction
        .sign(keys, { nonce })
        // Send transaction
        .send(({ events = [], status }) => {
          // Debug show transaction status
          transactionShowStatus(status, 'setLeader');
          if (status.isFinalized) {
            events.forEach(async ({ event: { data, method, section } }) => {
              if (section.toString() === 'archipelModule' && method.toString() === 'NewLeader') {
                // Show transaction data for Debug
                console.log('Transaction was successfully sent and generated an event.');
                console.log(`JSON Data: [${JSON.parse(data.toString())}]`);
                resolve(true);
              }
            });
            resolve(false);
          }
        }).catch(err => reject(err));
    });
  } catch (error) {
    debug('setLeader', error);
    throw error;
  }
};

// Show chain node info
const chainNodeInfo = async api => {
  try {
    // Get network state and system health
    const networkState = await api.rpc.system.networkState();
    const health = await api.rpc.system.health();

    console.log('--------------- Chain node network state and health ----------------');
    console.log(`Peer ID: ${networkState.peerId}`);
    console.log(`Peer number: ${health.peers}`);
    console.log(`Is syncing?: ${health.isSyncing}`);
    console.log('--------------------------------------------------------------------');
  } catch (error) {
    debug('chainNodeInfo', error);
    console.error(error);
  }
};

module.exports = {
  connect,
  listenEvents,
  addMetrics,
  getLeader,
  setLeader,
  chainNodeInfo,
  getMetrics,
  canSendTransactions,
  getPeerNumber
};
