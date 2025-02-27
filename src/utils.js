import {
  GAMES, PRED_STATUS_INIT, PRED_STATUS_IN_MEMPOOL, PRED_STATUS_PUT_OK,
  PRED_STATUS_PUT_ERROR, PRED_STATUS_CONFIRMED_OK, PRED_STATUS_CONFIRMED_ERROR,
  PRED_STATUS_VERIFIABLE, PRED_STATUS_VERIFYING, PRED_STATUS_VERIFIED_OK,
  PRED_STATUS_VERIFIED_ERROR, PDG, SCS,
} from './const';

export const runAsyncWrapper = (callback) => {
  return function (req, res, next) {
    callback(req, res, next).catch(next);
  }
};

export const getReferrer = (request) => {
  let referrer = request.get('Referrer');
  if (!referrer) referrer = request.get('Origin');
  return referrer;
};

export const randomString = (length) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const charactersLength = characters.length;

  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

export const removeTailingSlash = (url) => {
  if (url.slice(-1) === '/') return url.slice(0, -1);
  return url;
};

export const isObject = (val) => {
  return typeof val === 'object' && val !== null;
};

export const isString = (val) => {
  return typeof val === 'string';
};

export const isNumber = (val) => {
  return typeof val === 'number' && isFinite(val);
};

export const isEqual = (x, y) => {
  if (x === y) return true;
  // if both x and y are null or undefined and exactly the same

  if (!(x instanceof Object) || !(y instanceof Object)) return false;
  // if they are not strictly equal, they both need to be Objects

  if (x.constructor !== y.constructor) return false;
  // they must have the exact same prototype chain, the closest we can do is
  // test there constructor.

  for (const p in x) {
    if (!x.hasOwnProperty(p)) continue;
    // other properties were tested using x.constructor === y.constructor

    if (!y.hasOwnProperty(p)) return false;
    // allows to compare x[ p ] and y[ p ] when set to undefined

    if (x[p] === y[p]) continue;
    // if they have the same strict value or identity then they are equal

    if (typeof (x[p]) !== 'object') return false;
    // Numbers, Strings, Functions, Booleans must be strictly equal

    if (!isEqual(x[p], y[p])) return false;
    // Objects and Arrays must be tested recursively
  }

  for (const p in y) {
    if (y.hasOwnProperty(p) && !x.hasOwnProperty(p)) return false;
    // allows x[ p ] to be set to undefined
  }
  return true;
};

export const isFldStr = (val) => {
  return isString(val) && val.length > 0;
};

export const areAllString = (...vals) => {
  for (const val of vals) {
    if (!isString(val)) return false;
  }
  return true;
};

export const newObject = (object, ignoreAttrs) => {
  const nObject = {};
  for (const attr in object) {
    if (ignoreAttrs.includes(attr)) continue;
    nObject[attr] = object[attr];
  }
  return nObject;
};

export const validateEmail = (email) => {
  if (!isString(email)) return false;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validateUser = (stxAddr, user) => {
  if (!isObject(user)) return false;

  if ('username' in user && !isString(user.username)) return false;
  if ('avatar' in user && !isString(user.avatar)) return false;
  if ('bio' in user) {
    if (!isString(user.bio)) return false;
    if (user.bio.length > 160) return false;
  }
  if ('noInLdb' in user && ![true, false].includes(user.noInLdb)) return false;
  if ('noPlyrPg' in user && ![true, false].includes(user.noPlyrPg)) return false;

  return true;
};

export const validatePred = (stxAddr, pred) => {
  if (!isObject(pred)) return false;

  if (!isString(pred.id)) return false;
  if (!isString(pred.stxAddr) || pred.stxAddr !== stxAddr) return false;
  if (!GAMES.includes(pred.game)) return false;
  if (!isString(pred.contract)) return false;
  if (!isString(pred.value)) return false;
  if (!isNumber(pred.createDate)) return false;
  if (!isNumber(pred.updateDate)) return false;

  if ('cTxId' in pred && !isString(pred.cTxId)) return false;
  if ('pStatus' in pred && !isString(pred.pStatus)) return false;
  if ('cStatus' in pred && !isString(pred.cStatus)) return false;
  if ('anchorHeight' in pred && !isNumber(pred.anchorHeight)) return false;
  if ('anchorBurnHeight' in pred && !isNumber(pred.anchorBurnHeight)) return false;
  if ('seq' in pred && !isNumber(pred.seq)) return false;
  if ('targetBurnHeight' in pred && !isNumber(pred.targetBurnHeight)) return false;
  if ('vTxId' in pred && !isString(pred.vTxId)) return false;
  if ('targetHeight' in pred && !isNumber(pred.targetHeight)) return false;
  if ('vStatus' in pred && !isString(pred.vStatus)) return false;
  if ('anchorPrice' in pred && !isNumber(pred.anchorPrice)) return false;
  if ('targetPrice' in pred && !isNumber(pred.targetPrice)) return false;
  if (
    'correct' in pred && !['TRUE', 'FALSE', 'N/A'].includes(pred.correct)
  ) return false;

  return true;
};

export const mergePreds = (...preds) => {
  const bin = {
    updateDate: null,
    pStatus: { scs: null, updg: null },
    cStatus: { scs: null, updg: null },
    vStatus: { scs: null, updg: null },
  };

  let newPred = {};
  for (const pred of preds) {
    if (!isObject(pred)) continue;

    if (isNumber(pred.updateDate)) {
      if (!isNumber(bin.updateDate) || pred.updateDate > bin.updateDate) {
        bin.updateDate = pred.updateDate;
      }
    }
    if (isString(pred.pStatus)) {
      if (pred.pStatus === SCS) bin.pStatus.scs = pred.pStatus;
      else if (pred.pStatus !== PDG) bin.pStatus.updg = pred.pStatus;
    }
    if (isString(pred.cStatus)) {
      if (pred.cStatus === SCS) bin.cStatus.scs = pred.cStatus;
      else if (pred.cStatus !== PDG) bin.cStatus.updg = pred.cStatus;
    }
    if (isString(pred.vStatus)) {
      if (pred.vStatus === SCS) bin.vStatus.scs = pred.vStatus;
      else if (pred.vStatus !== PDG) bin.vStatus.updg = pred.vStatus;
    }

    newPred = { ...newPred, ...pred };
  }

  if (isNumber(bin.updateDate)) newPred.updateDate = bin.updateDate;

  if (isString(bin.pStatus.scs)) newPred.pStatus = bin.pStatus.scs;
  else if (isString(bin.pStatus.updg)) newPred.pStatus = bin.pStatus.updg;

  if (isString(bin.cStatus.scs)) newPred.cStatus = bin.cStatus.scs;
  else if (isString(bin.cStatus.updg)) newPred.cStatus = bin.cStatus.updg;

  if (isString(bin.vStatus.scs)) newPred.vStatus = bin.vStatus.scs;
  else if (isString(bin.vStatus.updg)) newPred.vStatus = bin.vStatus.updg;

  return newPred;
};

export const rectifyNewPred = (oldPred, newPred) => {
  const fixedAttrs = [
    'id', 'stxAddr', 'game', 'contract', 'value', 'createDate', 'cTxId', 'anchorHeight',
    'anchorBurnHeight', 'seq', 'targetBurnHeight',
  ];
  const limitedAttrs = [
    'vTxId', 'targetHeight', 'vStatus', 'anchorPrice', 'targetPrice', 'correct',
  ];

  const rtfdPred = { ...newPred }, now = Date.now();

  for (const attr of fixedAttrs) {
    if (isObject(oldPred) && attr in oldPred) {
      if (rtfdPred[attr] !== oldPred[attr]) {
        console.log('In rectifyNewPred, wrong fixed attrs', oldPred, newPred);
        rtfdPred[attr] = oldPred[attr];
      }
    }
  }
  for (const attr of limitedAttrs) {
    if (isObject(oldPred) && attr in oldPred) {
      if (rtfdPred[attr] !== oldPred[attr]) {
        console.log('In rectifyNewPred, wrong existing limited attrs', oldPred, newPred);
        rtfdPred[attr] = oldPred[attr];
      }
    } else {
      if (attr in rtfdPred) {
        console.log('In rectifyNewPred, wrong limited attrs', oldPred, newPred);
        delete rtfdPred[attr];
      }
    }
  }

  if (isObject(oldPred)) {
    rtfdPred.updateDate = now;
  } else {
    rtfdPred.updateDate = rtfdPred.createDate;
    if (rtfdPred.createDate > now || rtfdPred.createDate < (now - 60 * 60 * 1000)) {
      console.log('In rectifyNewPred, wrong createDate', oldPred, newPred);
      [rtfdPred.createDate, rtfdPred.updateDate] = [now, now];
    }
  }

  return rtfdPred;
};

export const getPredStatus = (pred, burnHeight = null) => {
  if ('pStatus' in pred && ![PDG, SCS].includes(pred.pStatus)) {
    return PRED_STATUS_PUT_ERROR;
  }
  if ('cStatus' in pred && ![PDG, SCS].includes(pred.cStatus)) {
    return PRED_STATUS_CONFIRMED_ERROR;
  }
  if ('vStatus' in pred && ![PDG, SCS].includes(pred.vStatus)) {
    return PRED_STATUS_VERIFIED_ERROR;
  }

  if (pred.vStatus === SCS) return PRED_STATUS_VERIFIED_OK;
  if ('vTxId' in pred) return PRED_STATUS_VERIFYING;
  if (pred.cStatus === SCS) {
    if (
      isNumber(pred.targetBurnHeight) &&
      isNumber(burnHeight) &&
      pred.targetBurnHeight < burnHeight
    ) {
      return PRED_STATUS_VERIFIABLE;
    }
    return PRED_STATUS_CONFIRMED_OK;
  }
  if (pred.pStatus === SCS) return PRED_STATUS_PUT_OK;
  if ('cTxId' in pred) return PRED_STATUS_IN_MEMPOOL;
  return PRED_STATUS_INIT;
};

export const isNotNullIn = (entity, key) => {
  return key in entity && entity[key] !== null;
};

export const parseAvatar = (str) => {
  // str can be undefined, null, empty string, filled string
  let avatar = {};
  if (isFldStr(str)) {
    try {
      const obj = JSON.parse(str);
      if (isObject(obj)) avatar = obj;
    } catch (error) {
      console.log('In utils/parseAvatar, invalid str:', error);
    }
  }
  return avatar;
};

export const isAvatarEqual = (strA, strB) => {
  let a = parseAvatar(strA);
  a = newObject(a, ['thumbnailAlt']);

  let b = parseAvatar(strB);
  b = newObject(b, ['thumbnailAlt']);

  return isEqual(a, b);
};
