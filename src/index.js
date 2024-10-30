import express from 'express';
import cors from 'cors';

import dataApi from './data';
import { ALLOWED_ORIGINS, VALID, ERROR } from './const';
import {
  runAsyncWrapper, getReferrer, randomString, removeTailingSlash, isObject, isString,
  validateEmail,
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
    res.send(JSON.stringify(results));
    return;
  }

  const { email } = reqBody;
  if (!isString(email) || !validateEmail(email)) {
    console.log(`(${logKey}) Invalid email, return ERROR`);
    results.status = ERROR;
    res.send(JSON.stringify(results));
    return;
  }

  await dataApi.addNewsletterEmail(logKey, email);
  console.log(`(${logKey}) Saved to Datastore`);

  console.log(`(${logKey}) /add-newsletter-email finished`);
  res.status(200).end();
}));

// Listen to the App Engine-specified port, or 8088 otherwise
const PORT = process.env.PORT || 8088;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
  console.log('Press Ctrl+C to quit.');
});
