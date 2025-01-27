import {
  verifyMessageSignatureRsv, verifyMessageSignature, verifyECDSA,
} from '@stacks/encryption';
import { getAddressFromPublicKey } from '@stacks/transactions';

import { STX_TST_STR } from './const';

const verify = (stxAddr, stxPubKey, stxTstStr, stxSigStr) => {
  if (stxTstStr !== STX_TST_STR) return false;

  const addr = getAddressFromPublicKey(stxPubKey);
  if (addr !== stxAddr) return false;

  let rst = verifyMessageSignatureRsv({
    publicKey: stxPubKey, message: stxTstStr, signature: stxSigStr,
  });
  if (rst === true) return rst;

  rst = verifyMessageSignature({
    publicKey: stxPubKey, message: stxTstStr, signature: stxSigStr,
  });
  if (rst === true) return rst;

  rst = verifyECDSA(stxTstStr, stxPubKey, stxSigStr);
  return rst;
};

const auth = { verify };

export default auth;
