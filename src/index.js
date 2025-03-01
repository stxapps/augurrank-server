import express from 'express';
import cors from 'cors';

import authApi from './auth';
import dataApi from './data';
import {
  ALLOWED_ORIGINS, VALID, ERROR, GAMES, N_PREDS, PRED_STATUS_VERIFIED_OK,
} from './const';
import {
  runAsyncWrapper, getReferrer, randomString, removeTailingSlash, isObject, isNumber,
  isFldStr, areAllString, validateEmail, validateUser, validatePred, getPredStatus,
} from './utils';

const corsConfig = cors({
  origin: '*',
  // Set the Access-Control-Max-Age header to 365 days.
  maxAge: 60 * 60 * 24 * 365,
});

const app = express();
app.use(corsConfig);
app.use(express.json());

app.get('/', (_req, res) => {
  res.send('Welcome to <a href="https://augurrank.com">AugurRank</a>\'s server!');
});

app.post('/add-newsletter-email', runAsyncWrapper(async (req, res) => {
  const logKey = randomString(12);
  console.log(`(${logKey}) /add-newsletter-email receives a post request`);

  const results = { status: VALID };

  const referrer = getReferrer(req);
  console.log(`(${logKey}) Referrer: ${referrer}`);
  if (!referrer || !ALLOWED_ORIGINS.includes(removeTailingSlash(referrer))) {
    console.log(`(${logKey}) Not expected referrer.`);
  }

  const reqBody = req.body;
  console.log(`(${logKey}) Request body: ${JSON.stringify(reqBody)}`);
  if (!isObject(reqBody)) {
    console.log(`(${logKey}) Invalid reqBody, return ERROR`);
    results.status = ERROR;
    res.status(400).send(results);
    return;
  }

  const { email } = reqBody;
  if (!validateEmail(email)) {
    console.log(`(${logKey}) Invalid email, return ERROR`);
    results.status = ERROR;
    res.status(400).send(results);
    return;
  }

  await dataApi.addNewsletterEmail(logKey, email);

  console.log(`(${logKey}) /add-newsletter-email finished`);
  res.send(results);
}));

app.post('/game', runAsyncWrapper(async (req, res) => {
  const logKey = randomString(12);
  console.log(`(${logKey}) /game receives a post request`);

  const results = { status: VALID };

  const referrer = getReferrer(req);
  console.log(`(${logKey}) Referrer: ${referrer}`);
  if (!referrer || !ALLOWED_ORIGINS.includes(removeTailingSlash(referrer))) {
    console.log(`(${logKey}) Not expected referrer.`);
  }

  const reqBody = req.body;
  console.log(`(${logKey}) Request body: ${JSON.stringify(reqBody)}`);
  if (!isObject(reqBody)) {
    console.log(`(${logKey}) Invalid reqBody, return ERROR`);
    results.status = ERROR;
    res.status(400).send(results);
    return;
  }

  const { stxAddr, stxPubKey, stxTstStr, stxSigStr } = reqBody;
  if (!areAllString(stxAddr, stxPubKey, stxTstStr, stxSigStr)) {
    console.log(`(${logKey}) Invalid stx[Addr, PubKey, TstStr or SigStr] return ERROR`);
    results.status = ERROR;
    res.status(400).send(results);
    return;
  }

  const { game } = reqBody;
  if (!GAMES.includes(game)) {
    console.log(`(${logKey}) Invalid game, return ERROR`);
    results.status = ERROR;
    res.status(400).send(results);
    return;
  }

  const verifyResult = authApi.verify(stxAddr, stxPubKey, stxTstStr, stxSigStr);
  if (!verifyResult) {
    console.log(`(${logKey}) Invalid authApi.verify, return ERROR`);
    results.status = ERROR;
    res.status(401).send(results);
    return;
  }

  const user = await dataApi.getUser(stxAddr);
  if (!isObject(user)) {
    console.log(`(${logKey}) Not found user, just return`);
    [results.username, results.avatar, results.didAgreeTerms] = [null, null, null];
    [results.pred, results.stats] = [null, {}];
    res.send(results);
    return;
  }

  results.username = isFldStr(user.username) ? user.username : null;
  results.avatar = isFldStr(user.avatar) ? user.avatar : null;
  results.didAgreeTerms = (user.didAgreeTerms === true) ? true : null;

  const pred = await dataApi.getNewestPred(stxAddr, game);
  results.pred = pred;

  const stats = await dataApi.getStats(stxAddr, game);
  results.stats = stats;

  console.log(`(${logKey}) /game finished`);
  res.send(results);
}));

app.post('/me', runAsyncWrapper(async (req, res) => {
  const logKey = randomString(12);
  console.log(`(${logKey}) /me receives a post request`);

  const results = { status: VALID };

  const referrer = getReferrer(req);
  console.log(`(${logKey}) Referrer: ${referrer}`);
  if (!referrer || !ALLOWED_ORIGINS.includes(removeTailingSlash(referrer))) {
    console.log(`(${logKey}) Not expected referrer.`);
  }

  const reqBody = req.body;
  console.log(`(${logKey}) Request body: ${JSON.stringify(reqBody)}`);
  if (!isObject(reqBody)) {
    console.log(`(${logKey}) Invalid reqBody, return ERROR`);
    results.status = ERROR;
    res.status(400).send(results);
    return;
  }

  const { stxAddr, stxPubKey, stxTstStr, stxSigStr } = reqBody;
  if (!areAllString(stxAddr, stxPubKey, stxTstStr, stxSigStr)) {
    console.log(`(${logKey}) Invalid stx[Addr, TstStr, PubKey, or SigStr] return ERROR`);
    results.status = ERROR;
    res.status(400).send(results);
    return;
  }

  const verifyResult = authApi.verify(stxAddr, stxPubKey, stxTstStr, stxSigStr);
  if (!verifyResult) {
    console.log(`(${logKey}) Invalid authApi.verify, return ERROR`);
    results.status = ERROR;
    res.status(401).send(results);
    return;
  }

  const user = await dataApi.getUser(stxAddr);
  if (!isObject(user)) {
    console.log(`(${logKey}) Not found user, just return`);
    [results.username, results.avatar, results.bio] = [null, null, null];
    [results.stats, results.preds, results.hasMore] = [{}, [], false];
    res.send(results);
    return;
  }

  results.username = isFldStr(user.username) ? user.username : null;
  results.avatar = isFldStr(user.avatar) ? user.avatar : null;
  results.bio = isFldStr(user.bio) ? user.bio : null;

  const stats = await dataApi.getStats(stxAddr, 'me');
  results.stats = stats;

  const { preds, hasMore } = await dataApi.queryPreds(
    stxAddr, 'me', Date.now(), '<=', []
  );
  results.preds = preds;
  results.hasMore = hasMore;

  console.log(`(${logKey}) /me finished`);
  res.send(results);
}));

app.post('/preds', runAsyncWrapper(async (req, res) => {
  const logKey = randomString(12);
  console.log(`(${logKey}) /preds receives a post request`);

  const results = { status: VALID };

  const referrer = getReferrer(req);
  console.log(`(${logKey}) Referrer: ${referrer}`);
  if (!referrer || !ALLOWED_ORIGINS.includes(removeTailingSlash(referrer))) {
    console.log(`(${logKey}) Not expected referrer.`);
  }

  const reqBody = req.body;
  console.log(`(${logKey}) Request body: ${JSON.stringify(reqBody)}`);
  if (!isObject(reqBody)) {
    console.log(`(${logKey}) Invalid reqBody, return ERROR`);
    results.status = ERROR;
    res.status(400).send(results);
    return;
  }

  const { stxAddr, stxPubKey, stxTstStr, stxSigStr } = reqBody;
  if (!areAllString(stxAddr, stxPubKey, stxTstStr, stxSigStr)) {
    console.log(`(${logKey}) Invalid stx[Addr, TstStr, PubKey or SigStr] return ERROR`);
    results.status = ERROR;
    res.status(400).send(results);
    return;
  }

  let apiCode = 0;

  const { ids, game, createDate, operator, excludingIds } = reqBody;
  if (Array.isArray(ids) && ids.length > 0 && ids.length <= N_PREDS) {
    apiCode = 1;
  } else if (
    [...GAMES, 'me'].includes(game) &&
    isNumber(createDate) &&
    ['=', '<', '<=', '>', '>='].includes(operator) &&
    Array.isArray(excludingIds) && excludingIds.length <= N_PREDS
  ) {
    apiCode = 2;
  } else {
    console.log(`(${logKey}) Invalid ids, game, createDate, or others, return ERROR`);
    results.status = ERROR;
    res.status(400).send(results);
    return;
  }

  const verifyResult = authApi.verify(stxAddr, stxPubKey, stxTstStr, stxSigStr);
  if (!verifyResult) {
    console.log(`(${logKey}) Invalid authApi.verify, return ERROR`);
    results.status = ERROR;
    res.status(401).send(results);
    return;
  }

  const user = await dataApi.getUser(stxAddr);
  if (!isObject(user)) {
    console.log(`(${logKey}) Not found user, just return`);
    if (apiCode === 1) {
      results.preds = [];
    } else if (apiCode === 2) {
      [results.preds, results.hasMore] = [[], false];
    } else {
      console.log(`(${logKey}) Invalid apiCode, return ERROR`);
      results.status = ERROR;
      res.status(500).send(results);
      return;
    }
    res.send(results);
    return;
  }

  if (apiCode === 1) {
    const preds = await dataApi.getPreds(stxAddr, ids);
    results.preds = preds;
  } else if (apiCode === 2) {
    const { preds, hasMore } = await dataApi.queryPreds(
      stxAddr, game, createDate, operator, excludingIds
    );
    [results.preds, results.hasMore] = [preds, hasMore];
  } else {
    console.log(`(${logKey}) Invalid apiCode, return ERROR`);
    results.status = ERROR;
    res.status(500).send(results);
    return;
  }

  if (reqBody.fthMeStsIfVrfd === true) {
    const found = results.preds.some(pred => {
      return getPredStatus(pred) === PRED_STATUS_VERIFIED_OK;
    });
    if (found) {
      const stats = await dataApi.getStats(stxAddr, 'me');
      results.meStats = stats;
    }
  }

  console.log(`(${logKey}) /preds finished`);
  res.send(results);
}));

app.post('/user', runAsyncWrapper(async (req, res) => {
  const logKey = randomString(12);
  console.log(`(${logKey}) /user receives a post request`);

  const results = { status: VALID };

  const referrer = getReferrer(req);
  console.log(`(${logKey}) Referrer: ${referrer}`);
  if (!referrer || !ALLOWED_ORIGINS.includes(removeTailingSlash(referrer))) {
    console.log(`(${logKey}) Not expected referrer.`);
  }

  const reqBody = req.body;
  console.log(`(${logKey}) Request body: ${JSON.stringify(reqBody)}`);
  if (!isObject(reqBody)) {
    console.log(`(${logKey}) Invalid reqBody, return ERROR`);
    results.status = ERROR;
    res.status(400).send(results);
    return;
  }

  const { stxAddr, stxPubKey, stxTstStr, stxSigStr } = reqBody;
  if (!areAllString(stxAddr, stxPubKey, stxTstStr, stxSigStr)) {
    console.log(`(${logKey}) Invalid stx[Addr, TstStr, PubKey or SigStr] return ERROR`);
    results.status = ERROR;
    res.status(400).send(results);
    return;
  }

  const { user } = reqBody;
  if (!validateUser(stxAddr, user)) {
    console.log(`(${logKey}) Invalid user, return ERROR`);
    results.status = ERROR;
    res.status(400).send(results);
    return;
  }

  const verifyResult = authApi.verify(stxAddr, stxPubKey, stxTstStr, stxSigStr);
  if (!verifyResult) {
    console.log(`(${logKey}) Invalid authApi.verify, return ERROR`);
    results.status = ERROR;
    res.status(401).send(results);
    return;
  }

  await dataApi.updateUser(logKey, stxAddr, user);

  console.log(`(${logKey}) /user finished`);
  res.send(results);
}));

app.post('/pred', runAsyncWrapper(async (req, res) => {
  const logKey = randomString(12);
  console.log(`(${logKey}) /pred receives a post request`);

  const results = { status: VALID };

  const referrer = getReferrer(req);
  console.log(`(${logKey}) Referrer: ${referrer}`);
  if (!referrer || !ALLOWED_ORIGINS.includes(removeTailingSlash(referrer))) {
    console.log(`(${logKey}) Not expected referrer.`);
  }

  const reqBody = req.body;
  console.log(`(${logKey}) Request body: ${JSON.stringify(reqBody)}`);
  if (!isObject(reqBody)) {
    console.log(`(${logKey}) Invalid reqBody, return ERROR`);
    results.status = ERROR;
    res.status(400).send(results);
    return;
  }

  const { stxAddr, stxPubKey, stxTstStr, stxSigStr } = reqBody;
  if (!areAllString(stxAddr, stxPubKey, stxTstStr, stxSigStr)) {
    console.log(`(${logKey}) Invalid stx[Addr, TstStr, PubKey or SigStr] return ERROR`);
    results.status = ERROR;
    res.status(400).send(results);
    return;
  }

  const { pred } = reqBody;
  if (!validatePred(stxAddr, pred)) {
    console.log(`(${logKey}) Invalid pred, return ERROR`);
    results.status = ERROR;
    res.status(400).send(results);
    return;
  }

  const verifyResult = authApi.verify(stxAddr, stxPubKey, stxTstStr, stxSigStr);
  if (!verifyResult) {
    console.log(`(${logKey}) Invalid authApi.verify, return ERROR`);
    results.status = ERROR;
    res.status(401).send(results);
    return;
  }

  await dataApi.updatePred(logKey, stxAddr, pred);

  console.log(`(${logKey}) /pred finished`);
  res.send(results);
}));

// Listen to the App Engine-specified port, or 8088 otherwise
const PORT = process.env.PORT || 8088;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
  console.log('Press Ctrl+C to quit.');
});
