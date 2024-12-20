import { GAMES, PDG, SCS } from './const';

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
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
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
  return typeof val === 'string' || val instanceof String;
};

export const isNumber = (val) => {
  return typeof val === 'number' && isFinite(val);
};

export const validateEmail = (email) => {
  if (!isString(email)) return false;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePred = (pred) => {
  if (!isObject(pred)) return false;

  if (!isString(pred.id)) return false;
  if (!GAMES.includes(pred.game)) return false;
  if (!isString(pred.contract)) return false;
  if (!isString(pred.value)) return false;
  if (!isNumber(pred.createDate)) return false;
  if (!isNumber(pred.updateDate)) return false;
  if (!isString(pred.stxAddr)) return false;

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
  if ('correct' in pred && ![true, false].includes(pred.correct)) return false;

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
