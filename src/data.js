import { Datastore, PropertyFilter, and } from '@google-cloud/datastore';
import { CloudTasksClient } from '@google-cloud/tasks';

import {
  NEWSLETTER_EMAIL, USER, PRED, TOTAL, ACTIVE, N_PREDS, GAME_BTC,
  PRED_STATUS_CONFIRMED_OK, SCS,
} from './const';
import { isObject, isNumber, mergePreds, getPredStatus, isNotNullIn } from './utils';
import { AUGURRANK_SERVER_TASKER_URL, AUGURRANK_SERVER_TASKER_EMAIL } from './keys';

const datastore = new Datastore();
const tasks = new CloudTasksClient();

const addNewsletterEmail = async (logKey, email) => {
  const key = datastore.key([NEWSLETTER_EMAIL, email]);
  const data = [
    { name: 'status', value: ACTIVE },
    { name: 'createDate', value: new Date() },
    { name: 'updateDate', value: new Date() },
  ];
  const newEntity = { key, data };

  const [oldEntity] = await datastore.get(key);
  if (isObject(oldEntity)) {
    console.log(`(${logKey}) Add newsletter email with duplicate email:`, email);
    return;
  }

  await datastore.save(newEntity);
  console.log(`(${logKey}) Saved to Datastore`);
};

const updatePred = async (logKey, appBtcAddr, stxAddr, pred) => {
  const userKey = datastore.key([USER, appBtcAddr]);
  const predKey = datastore.key([PRED, pred.id]);

  const transaction = datastore.transaction();
  try {
    await transaction.run();

    let oldUser = null, newUser = null, oldPred = null, newPred = null;
    const entities = [], now = Date.now();

    const [oldUserEntity] = await transaction.get(userKey);
    if (isObject(oldUserEntity)) {
      if (oldUserEntity.stxAddr !== stxAddr) {
        await transaction.rollback();
        return -1;
      }
      oldUser = entityToUser(oldUserEntity);
    } else {
      newUser = {
        appBtcAddr, stxAddr, createDate: now, updateDate: now, didAgreeTerms: true,
      };
      entities.push({ key: userKey, data: userToEntityData(newUser) });
    }

    const [oldPredEntity] = await transaction.get(predKey);
    if (isObject(oldPredEntity)) {
      if (oldPredEntity.appBtcAddr !== appBtcAddr) {
        await transaction.rollback();
        return -2;
      }
      oldPred = entityToPred(oldPredEntity);
    }

    newPred = mergePreds(oldPred, pred);
    entities.push({ key: predKey, data: predToEntityData(appBtcAddr, newPred) });

    transaction.save(entities);
    await transaction.commit();

    await addTaskToQueue(logKey, oldUser, newUser, oldPred, newPred);

    return 0;
  } catch (e) {
    await transaction.rollback(); // wait and see if should retry
    throw e;
  }
};

const getUser = async (appBtcAddr) => {
  const key = datastore.key([USER, appBtcAddr]);
  const [entity] = await datastore.get(key);

  const user = isObject(entity) ? entityToUser(entity) : null;
  return user;
};

const getNewestPred = async (appBtcAddr, game) => {
  const query = datastore.createQuery(PRED);
  query.filter(and([
    new PropertyFilter('appBtcAddr', '=', appBtcAddr),
    new PropertyFilter('game', '=', game),
  ]));
  query.order('createDate', { descending: true });
  query.limit(1);
  const [entities] = await datastore.runQuery(query);

  let pred = null;
  if (Array.isArray(entities) && isObject(entities[0])) {
    pred = entityToPred(entities[0]);
  }
  return pred;
};

const getPreds = async (appBtcAddr, ids) => {
  const keys = ids.map(id => datastore.key([PRED, id]));
  const [entities] = await datastore.get(keys);

  const preds = [];
  if (Array.isArray(entities)) {
    for (const entity of entities) {
      if (!isObject(entity) || entity.appBtcAddr !== appBtcAddr) continue;
      preds.push(entityToPred(entity));
    }
  }
  return preds;
};

const queryPreds = async (appBtcAddr, game, createDate, operator, excludingIds) => {
  let descending = false;
  if (operator.includes('<')) descending = true;

  const limit = N_PREDS + excludingIds.length + 1;

  const fltrs = /** @type any[] */([new PropertyFilter('appBtcAddr', '=', appBtcAddr)]);
  if (game !== 'me') fltrs.push(new PropertyFilter('game', '=', game));
  fltrs.push(new PropertyFilter('createDate', operator, new Date(createDate)));

  const query = datastore.createQuery(PRED);
  query.filter(and(fltrs));
  query.order('createDate', { descending });
  query.limit(limit);

  const [entities] = await datastore.runQuery(query);

  let nEntes = 0, nExcld = 0, preds = [];
  if (Array.isArray(entities)) {
    for (const entity of entities) {
      if (!isObject(entity)) continue;
      nEntes += 1;

      const pred = entityToPred(entity);
      if (excludingIds.includes(pred.id)) {
        nExcld += 1;
        continue;
      }
      preds.push(pred); // must not break to count all excluding entites.
    }
  }

  preds = preds.slice(0, N_PREDS);
  const hasMore = (nEntes - nExcld) > N_PREDS;

  return { preds, hasMore };
};

const getStats = async (appBtcAddr, game) => {
  const keyNames = [];
  if (game === GAME_BTC) {
    keyNames.push('GameBtc-count-appBtcAddr'); // number of participants
    keyNames.push('GameBtc-up-verified_ok-true-count'); // wins
    keyNames.push('GameBtc-up-verified_ok-false-count'); // loses
    keyNames.push('GameBtc-down-verified_ok-true-count'); // wins
    keyNames.push('GameBtc-down-verified_ok-false-count'); // loses
    keyNames.push('GameBtc-up-confirmed_ok-count'); // up pending
    keyNames.push('GameBtc-down-confirmed_ok-count'); // down pending
  } else if (game === 'me') {
    keyNames.push(`${appBtcAddr}-up-verified_ok-true-count`); // wins
    keyNames.push(`${appBtcAddr}-up-verified_ok-false-count`); // loses
    keyNames.push(`${appBtcAddr}-down-verified_ok-true-count`); // wins
    keyNames.push(`${appBtcAddr}-down-verified_ok-false-count`); // loses
    keyNames.push(`${appBtcAddr}-up-confirmed_ok-count`); // up pending
    keyNames.push(`${appBtcAddr}-down-confirmed_ok-count`); // down pending
    keyNames.push(`${appBtcAddr}-confirmed_ok-count-cont-day`); // continue days so far
    keyNames.push(`${appBtcAddr}-verified_ok-true-count-cont`); // cont. true so far
    keyNames.push(`${appBtcAddr}-verified_ok-false-count-cont`); // cont. false so far
    keyNames.push(`${appBtcAddr}-confirmed_ok-max-cont-day`); // max cont. days
    keyNames.push(`${appBtcAddr}-verified_ok-true-max-cont`); // max cont. true
    keyNames.push(`${appBtcAddr}-verified_ok-false-max-cont`); // max cont. false
  }

  const keys = keyNames.map(kn => datastore.key([TOTAL, kn]));
  const [entities] = await datastore.get(keys);

  const stats = {};
  if (Array.isArray(entities)) {
    for (let i = 0; i < keyNames.length; i++) {
      const [kn, entity] = [keyNames[i], entities[i]];
      if (!isObject(entity) || !isNumber(entity.outcome)) continue;

      stats[kn] = entity.outcome;
    }
  }

  return stats;
};

const addTaskToQueue = async (logKey, oldUser, newUser, oldPred, newPred) => {
  const doAdd = (
    getPredStatus(newPred) === PRED_STATUS_CONFIRMED_OK &&
    (oldPred === null || getPredStatus(oldPred) !== PRED_STATUS_CONFIRMED_OK)
  )
  if (!doAdd) return;

  const [project, location] = ['augurrank-001', 'us-central1'];
  const queue = 'augurrank-server-tasker';

  const parent = tasks.queuePath(project, location, queue);
  const task = {
    httpRequest: {
      headers: { 'Content-Type': 'application/json', },
      httpMethod: /** @type any */('POST'),
      url: AUGURRANK_SERVER_TASKER_URL,
      body: Buffer.from(JSON.stringify({
        oldUser, newUser, oldPred, newPred,
      })).toString("base64"),
      oidcToken: { serviceAccountEmail: AUGURRANK_SERVER_TASKER_EMAIL },
    },
  };

  try {
    tasks.createTask({ parent, task });
  } catch (error) {
    console.error(`(${logKey}) addTaskToQueue error`, error);
  }
};

const userToEntityData = (user) => {
  const data = [
    { name: 'stxAddr', value: user.stxAddr },
    { name: 'createDate', value: new Date(user.createDate) },
    { name: 'updateDate', value: new Date(user.updateDate) },
  ];
  if ('didAgreeTerms' in user) {
    data.push({ name: 'didAgreeTerms', value: user.didAgreeTerms });
  }
  if ('isVerified' in user) {
    data.push({ name: 'isVerified', value: user.isVerified });
  }
  return data;
};

const predToEntityData = (appBtcAddr, pred) => {
  // Need cStatus, vTxId, and vStatus for Datastore queries in worker.
  let isCstRqd = false, isVxiRqd = false, isVstRqd = false;

  const data = [
    { name: 'game', value: pred.game },
    { name: 'contract', value: pred.contract },
    { name: 'value', value: pred.value },
    { name: 'createDate', value: new Date(pred.createDate) },
    { name: 'updateDate', value: new Date(pred.updateDate) },
    { name: 'stxAddr', value: pred.stxAddr },
  ];
  if ('cTxId' in pred) {
    data.push({ name: 'cTxId', value: pred.cTxId });
    isCstRqd = true;
  }
  if ('pStatus' in pred) data.push({ name: 'pStatus', value: pred.pStatus });
  if ('cStatus' in pred) {
    data.push({ name: 'cStatus', value: pred.cStatus });
    if (pred.cStatus === SCS) isVxiRqd = true;
  } else if (isCstRqd) {
    data.push({ name: 'cStatus', value: null });
  }
  if ('anchorHeight' in pred) {
    data.push({ name: 'anchorHeight', value: pred.anchorHeight });
  }
  if ('anchorBurnHeight' in pred) {
    data.push({ name: 'anchorBurnHeight', value: pred.anchorBurnHeight });
  }
  if ('seq' in pred) {
    data.push({ name: 'seq', value: pred.seq });
  }
  if ('targetBurnHeight' in pred) {
    data.push({ name: 'targetBurnHeight', value: pred.targetBurnHeight });
  }
  if ('vTxId' in pred) {
    data.push({ name: 'vTxId', value: pred.vTxId });
    isVstRqd = true;
  } else if (isVxiRqd) {
    data.push({ name: 'vTxId', value: null });
  }
  if ('targetHeight' in pred) {
    data.push({ name: 'targetHeight', value: pred.targetHeight });
  }
  if ('vStatus' in pred) {
    data.push({ name: 'vStatus', value: pred.vStatus });
  } else if (isVstRqd) {
    data.push({ name: 'vStatus', value: null });
  }
  if ('anchorPrice' in pred) {
    data.push({ name: 'anchorPrice', value: pred.anchorPrice });
  }
  if ('targetPrice' in pred) {
    data.push({ name: 'targetPrice', value: pred.targetPrice });
  }
  if ('correct' in pred) {
    data.push({ name: 'correct', value: pred.correct });
  }

  // IMPORTANT: pred doesn't have appBtcAddr, but predEntity must have it!
  data.push({ name: 'appBtcAddr', value: appBtcAddr });

  return data;
};

const entityToUser = (entity) => {
  const user = {
    appBtcAddr: entity[datastore.KEY].name,
    stxAddr: entity.stxAddr,
    createDate: entity.createDate.getTime(),
    updateDate: entity.updateDate.getTime(),
  };
  if (isNotNullIn(entity, 'didAgreeTerms')) user.didAgreeTerms = entity.didAgreeTerms;
  if (isNotNullIn(entity, 'isVerified')) user.isVerified = entity.isVerified;

  return user;
};

const entityToPred = (entity) => {
  const pred = {
    id: entity[datastore.KEY].name,
    game: entity.game,
    contract: entity.contract,
    value: entity.value,
    createDate: entity.createDate.getTime(),
    updateDate: entity.updateDate.getTime(),
    stxAddr: entity.stxAddr,
  };
  if (isNotNullIn(entity, 'cTxId')) pred.cTxId = entity.cTxId;
  if (isNotNullIn(entity, 'pStatus')) pred.pStatus = entity.pStatus;
  if (isNotNullIn(entity, 'cStatus')) pred.cStatus = entity.cStatus;
  if (isNotNullIn(entity, 'anchorHeight')) pred.anchorHeight = entity.anchorHeight;
  if (isNotNullIn(entity, 'anchorBurnHeight')) {
    pred.anchorBurnHeight = entity.anchorBurnHeight;
  }
  if (isNotNullIn(entity, 'seq')) pred.seq = entity.seq;
  if (isNotNullIn(entity, 'targetBurnHeight')) {
    pred.targetBurnHeight = entity.targetBurnHeight;
  }
  if (isNotNullIn(entity, 'vTxId')) pred.vTxId = entity.vTxId;
  if (isNotNullIn(entity, 'targetHeight')) pred.targetHeight = entity.targetHeight;
  if (isNotNullIn(entity, 'vStatus')) pred.vStatus = entity.vStatus;
  if (isNotNullIn(entity, 'anchorPrice')) pred.anchorPrice = entity.anchorPrice;
  if (isNotNullIn(entity, 'targetPrice')) pred.targetPrice = entity.targetPrice;
  if (isNotNullIn(entity, 'correct')) pred.correct = entity.correct;

  return pred;
};

const data = {
  addNewsletterEmail, updatePred, getUser, getNewestPred, getPreds, queryPreds,
  getStats,
};

export default data;
