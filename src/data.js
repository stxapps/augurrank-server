import { Datastore, PropertyFilter, and } from '@google-cloud/datastore';
import { CloudTasksClient } from '@google-cloud/tasks';

import {
  NEWSLETTER_EMAIL, USER, PRED, TOTAL, ACTIVE, N_PREDS, GAME_BTC,
  PRED_STATUS_CONFIRMED_OK, SCS,
} from './const';
import {
  isObject, isNumber, isFldStr, newObject, mergePreds, rectifyNewPred, getPredStatus,
  isNotNullIn, isAvatarEqual,
} from './utils';
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

const updateUser = async (logKey, stxAddr, user) => {
  const userKey = datastore.key([USER, stxAddr]);

  const transaction = datastore.transaction();
  try {
    await transaction.run();

    const [oldEntity] = await transaction.get(userKey);
    if (!isObject(oldEntity)) {
      throw new Error(`Not found user for stxAddr: ${stxAddr}`);
    }
    const oldUser = entityToUser(oldEntity);

    const attrs = ['username', 'avatar', 'bio', 'usnVrfDt', 'avtVrfDt'];
    const newUser = newObject(oldUser, attrs);

    let isDiff = false;
    if (isFldStr(oldUser.username) && isFldStr(user.username)) {
      if (oldUser.username === user.username) {
        [newUser.username, newUser.usnVrfDt] = [oldUser.username, oldUser.usnVrfDt];
      } else {
        [newUser.username, newUser.usnVrfDt, isDiff] = [user.username, null, true];
      }
    } else if (isFldStr(user.username)) {
      [newUser.username, newUser.usnVrfDt, isDiff] = [user.username, null, true];
    } else if (isFldStr(oldUser.username) && !('username' in user)) {
      [newUser.username, newUser.usnVrfDt] = [oldUser.username, oldUser.usnVrfDt];
    } else if (isFldStr(oldUser.username)) {
      isDiff = true;
    }

    if (isFldStr(oldUser.avatar) && isFldStr(user.avatar)) {
      if (isAvatarEqual(oldUser.avatar, user.avatar)) {
        [newUser.avatar, newUser.avtVrfDt] = [oldUser.avatar, oldUser.avtVrfDt];
      } else {
        [newUser.avatar, newUser.avtVrfDt, isDiff] = [user.avatar, null, true];
      }
    } else if (isFldStr(user.avatar)) {
      [newUser.avatar, newUser.avtVrfDt, isDiff] = [user.avatar, null, true];
    } else if (isFldStr(oldUser.avatar) && !('avatar' in user)) {
      [newUser.avatar, newUser.avtVrfDt] = [oldUser.avatar, oldUser.avtVrfDt];
    } else if (isFldStr(oldUser.avatar)) {
      isDiff = true;
    }

    if (isFldStr(oldUser.bio) && isFldStr(user.bio)) {
      if (oldUser.bio === user.bio) {
        newUser.bio = oldUser.bio;
      } else {
        [newUser.bio, isDiff] = [user.bio, true];
      }
    } else if (isFldStr(user.bio)) {
      [newUser.bio, isDiff] = [user.bio, true];
    } else if (isFldStr(oldUser.bio) && !('bio' in user)) {
      newUser.bio = oldUser.bio;
    } else if (isFldStr(oldUser.bio)) {
      isDiff = true;
    }

    if (isDiff) {
      newUser.updateDate = Date.now();

      transaction.save({ key: userKey, data: userToEntityData(newUser) });
      await transaction.commit();
    } else {
      await transaction.rollback();
    }
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const updatePred = async (logKey, stxAddr, pred) => {
  const userKey = datastore.key([USER, stxAddr]);
  const predKey = datastore.key([PRED, pred.id]);

  const transaction = datastore.transaction();
  try {
    await transaction.run();

    let oldUser = null, newUser = null, oldPred = null, newPred = null;
    const entities = [], now = Date.now();

    const [oldUserEntity] = await transaction.get(userKey);
    if (isObject(oldUserEntity)) {
      oldUser = entityToUser(oldUserEntity);
    } else {
      newUser = {
        stxAddr, createDate: now, updateDate: now, didAgreeTerms: true,
      };
      entities.push({ key: userKey, data: userToEntityData(newUser) });
    }

    const [oldPredEntity] = await transaction.get(predKey);
    if (isObject(oldPredEntity)) {
      oldPred = entityToPred(oldPredEntity);
    }

    newPred = mergePreds(oldPred, pred);
    newPred = rectifyNewPred(oldPred, newPred);

    entities.push({ key: predKey, data: predToEntityData(newPred) });

    transaction.save(entities);
    await transaction.commit();

    await addTaskToQueue(logKey, oldUser, newUser, oldPred, newPred);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const getUser = async (stxAddr) => {
  const key = datastore.key([USER, stxAddr]);
  const [entity] = await datastore.get(key);

  const user = isObject(entity) ? entityToUser(entity) : null;
  return user;
};

const getNewestPred = async (stxAddr, game) => {
  const query = datastore.createQuery(PRED);
  query.filter(and([
    new PropertyFilter('stxAddr', '=', stxAddr),
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

const getPreds = async (stxAddr, ids) => {
  const keys = ids.map(id => datastore.key([PRED, id]));
  const [entities] = await datastore.get(keys);

  const preds = [];
  if (Array.isArray(entities)) {
    for (const entity of entities) {
      if (!isObject(entity) || entity.stxAddr !== stxAddr) continue;
      preds.push(entityToPred(entity));
    }
  }
  return preds;
};

const queryPreds = async (stxAddr, game, createDate, operator, excludingIds) => {
  let descending = false;
  if (operator.includes('<')) descending = true;

  const limit = N_PREDS + excludingIds.length + 1;

  const fltrs = /** @type any[] */([new PropertyFilter('stxAddr', '=', stxAddr)]);
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

const getStats = async (stxAddr, game) => {
  const keyNames = [];
  if (game === GAME_BTC) {
    keyNames.push('GameBtc-count-stxAddr'); // number of participants
    keyNames.push('GameBtc-up-verified_ok-TRUE-count'); // wins
    keyNames.push('GameBtc-up-verified_ok-FALSE-count'); // losses
    keyNames.push('GameBtc-down-verified_ok-TRUE-count'); // wins
    keyNames.push('GameBtc-down-verified_ok-FALSE-count'); // losses
    keyNames.push('GameBtc-up-confirmed_ok-count'); // up pending
    keyNames.push('GameBtc-down-confirmed_ok-count'); // down pending
  } else if (game === 'me') {
    keyNames.push(`${stxAddr}-up-verified_ok-TRUE-count`); // wins
    keyNames.push(`${stxAddr}-up-verified_ok-FALSE-count`); // losses
    keyNames.push(`${stxAddr}-down-verified_ok-TRUE-count`); // wins
    keyNames.push(`${stxAddr}-down-verified_ok-FALSE-count`); // losses
    keyNames.push(`${stxAddr}-up-confirmed_ok-count`); // up pending
    keyNames.push(`${stxAddr}-down-confirmed_ok-count`); // down pending
    keyNames.push(`${stxAddr}-confirmed_ok-count-cont-day`); // continue days so far
    keyNames.push(`${stxAddr}-verified_ok-TRUE-count-cont`); // cont. wins so far
    keyNames.push(`${stxAddr}-verified_ok-FALSE-count-cont`); // cont. losses so far
    keyNames.push(`${stxAddr}-confirmed_ok-max-cont-day`); // max cont. days
    keyNames.push(`${stxAddr}-verified_ok-TRUE-max-cont`); // max cont. wins
    keyNames.push(`${stxAddr}-verified_ok-FALSE-max-cont`); // max cont. losses
  }

  const keys = keyNames.map(kn => datastore.key([TOTAL, kn]));
  const [entities] = await datastore.get(keys);

  const stats = {};
  if (Array.isArray(entities)) {
    for (const entity of entities) {
      if (!isObject(entity) || !isNumber(entity.outcome)) continue;
      stats[entity[datastore.KEY].name] = entity.outcome;
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
      headers: { 'Content-Type': 'application/json' },
      httpMethod: /** @type any */('POST'),
      url: AUGURRANK_SERVER_TASKER_URL,
      body: Buffer.from(JSON.stringify({
        oldUser, newUser, oldPred, newPred,
      })).toString('base64'),
      oidcToken: { serviceAccountEmail: AUGURRANK_SERVER_TASKER_EMAIL },
    },
  };

  try {
    await tasks.createTask({ parent, task });
  } catch (error) {
    console.error(`(${logKey}) addTaskToQueue error`, error);
  }
};

const userToEntityData = (user) => {
  const data = [
    { name: 'createDate', value: new Date(user.createDate) },
    { name: 'updateDate', value: new Date(user.updateDate) },
  ];
  if ('username' in user) {
    data.push({ name: 'username', value: user.username });

    let usnVrfDt = null;
    if ('usnVrfDt' in user) usnVrfDt = user.usnVrfDt;
    data.push({ name: 'usnVrfDt', value: usnVrfDt });
  }
  if ('avatar' in user) {
    data.push({ name: 'avatar', value: user.avatar, excludeFromIndexes: true });

    let avtVrfDt = null;
    if ('avtVrfDt' in user) avtVrfDt = user.avtVrfDt;
    data.push({ name: 'avtVrfDt', value: avtVrfDt });
  }
  if ('bio' in user) {
    data.push({ name: 'bio', value: user.bio, excludeFromIndexes: true });
  }
  if ('didAgreeTerms' in user) {
    data.push({ name: 'didAgreeTerms', value: user.didAgreeTerms });
  }
  return data;
};

const predToEntityData = (pred) => {
  // Need cStatus, vTxId, and vStatus for Datastore queries in worker.
  let isCstRqd = false, isVxiRqd = false, isVstRqd = false;

  const data = [
    { name: 'stxAddr', value: pred.stxAddr },
    { name: 'game', value: pred.game },
    { name: 'contract', value: pred.contract },
    { name: 'value', value: pred.value },
    { name: 'createDate', value: new Date(pred.createDate) },
    { name: 'updateDate', value: new Date(pred.updateDate) },
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

  return data;
};

const entityToUser = (entity) => {
  const user = {
    stxAddr: entity[datastore.KEY].name,
    createDate: entity.createDate.getTime(),
    updateDate: entity.updateDate.getTime(),
  };
  if (isNotNullIn(entity, 'username')) user.username = entity.username;
  if (isNotNullIn(entity, 'avatar')) user.avatar = entity.avatar;
  if (isNotNullIn(entity, 'bio')) user.bio = entity.bio;
  if (isNotNullIn(entity, 'didAgreeTerms')) user.didAgreeTerms = entity.didAgreeTerms;

  return user;
};

const entityToPred = (entity) => {
  const pred = {
    id: entity[datastore.KEY].name,
    stxAddr: entity.stxAddr,
    game: entity.game,
    contract: entity.contract,
    value: entity.value,
    createDate: entity.createDate.getTime(),
    updateDate: entity.updateDate.getTime(),
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
  addNewsletterEmail, updateUser, updatePred, getUser, getNewestPred, getPreds,
  queryPreds, getStats,
};

export default data;
